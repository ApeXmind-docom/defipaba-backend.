import {
  makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
  type WASocket,
} from "@whiskeysockets/baileys";
import type { Boom } from "@hapi/boom";
import qrcodeTerminal from "qrcode-terminal";
import QRCode from "qrcode";
import pino from "pino";
import { mkdirSync } from "node:fs";

import type { WhatsAppLine } from "../config.js";
import { log } from "../util/log.js";
import { setLineConnected, setLineQr } from "./status.js";

export type MessageHandler = (
  sock: WASocket,
  line: WhatsAppLine,
  jid: string,
  text: string,
  pushName: string | null,
) => Promise<void>;

/** Baileys es muy verboso; su logger va aparte del nuestro. */
const baileysLogger = pino({ level: "warn" });

function extractText(message: Record<string, unknown> | null | undefined): string | null {
  if (!message) return null;
  const m = message as {
    conversation?: string;
    extendedTextMessage?: { text?: string };
    imageMessage?: { caption?: string };
    videoMessage?: { caption?: string };
    ephemeralMessage?: { message?: Record<string, unknown> };
    viewOnceMessageV2?: { message?: Record<string, unknown> };
  };

  if (m.ephemeralMessage?.message) return extractText(m.ephemeralMessage.message);
  if (m.viewOnceMessageV2?.message) return extractText(m.viewOnceMessageV2.message);

  const text =
    m.conversation ??
    m.extendedTextMessage?.text ??
    m.imageMessage?.caption ??
    m.videoMessage?.caption ??
    null;

  return text && text.trim() ? text.trim() : null;
}

/**
 * Arranca una línea de WhatsApp. Cada línea es una sesión independiente
 * (número, credenciales y QR propios) — eso lo exige WhatsApp, no es una
 * limitación nuestra — pero todas invocan el mismo `onMessage`, que es donde
 * vive el cerebro compartido (Claude, la base de leads, el calendario).
 */
export async function startLine(line: WhatsAppLine, onMessage: MessageHandler): Promise<WASocket> {
  mkdirSync(line.sessionDir, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(line.sessionDir);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger: baileysLogger,
    browser: [`PABA AI · ${line.name}`, "Chrome", "1.0.0"],
    markOnlineOnConnect: false,
    syncFullHistory: false,
    generateHighQualityLinkPreview: false,
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      log.info({ line: line.name }, `Escanea este QR desde WhatsApp > Dispositivos vinculados (${line.name})`);
      qrcodeTerminal.generate(qr, { small: true });

      /* El panel lo necesita como imagen, no como texto de terminal — así
       * quien tenga que escanearlo no necesita entrar a los logs de Render. */
      QRCode.toDataURL(qr, { margin: 1, scale: 6 })
        .then((dataUrl) => setLineQr(line.number, dataUrl))
        .catch((error) => log.error({ error, line: line.name }, "No se pudo generar la imagen del QR"));
    }

    if (connection === "open") {
      setLineConnected(line.number, true);
      log.info({ line: line.name, number: line.number }, "WhatsApp conectado");
    }

    if (connection === "close") {
      setLineConnected(line.number, false);
      const status = (lastDisconnect?.error as Boom | undefined)?.output?.statusCode;
      const loggedOut = status === DisconnectReason.loggedOut;

      log.warn(
        { line: line.name, status },
        loggedOut ? "Sesion cerrada desde el telefono" : "Conexion caida",
      );

      if (loggedOut) {
        log.error(
          `[${line.name}] Borra la carpeta ${line.sessionDir} y vuelve a vincular el dispositivo.`,
        );
        return;
      }

      /* Reconexion con espera: reintentar en bucle cerrado es otra senal de bot. */
      setTimeout(() => {
        startLine(line, onMessage).catch((error) =>
          log.error({ error, line: line.name }, "Fallo al reconectar"),
        );
      }, 4000);
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;

    for (const message of messages) {
      const jid = message.key.remoteJid;
      if (!jid) continue;

      // Grupos, estados y difusiones quedan fuera: PABA es uno a uno.
      if (message.key.fromMe) continue;
      if (jid.endsWith("@g.us") || jid === "status@broadcast" || jid.endsWith("@broadcast")) continue;
      if (!jid.endsWith("@s.whatsapp.net")) continue;

      const text = extractText(message.message as Record<string, unknown> | null);
      const pushName = message.pushName ?? null;

      try {
        await sock.readMessages([message.key]);
      } catch {
        /* Marcar como leido es cosmetico; si falla, no bloquea la respuesta. */
      }

      if (!text) {
        log.info({ line: line.name, jid }, "Mensaje sin texto recibido");
        continue;
      }

      try {
        await onMessage(sock, line, jid, text, pushName);
      } catch (error) {
        log.error({ error, line: line.name, jid }, "Fallo al procesar el mensaje");
      }
    }
  });

  return sock;
}

/**
 * Arranca todas las líneas configuradas en paralelo y devuelve un mapa
 * numero -> socket, que el planificador usa para saber por cuál línea
 * responder a cada lead.
 */
export async function startAllLines(
  lines: WhatsAppLine[],
  onMessage: MessageHandler,
): Promise<Map<string, WASocket>> {
  const sockets = new Map<string, WASocket>();

  await Promise.all(
    lines.map(async (line) => {
      const sock = await startLine(line, onMessage);
      sockets.set(line.number, sock);
    }),
  );

  return sockets;
}

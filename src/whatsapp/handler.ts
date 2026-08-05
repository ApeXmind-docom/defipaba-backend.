import type { WASocket } from "@whiskeysockets/baileys";

import { runAgent } from "../agent/claude.js";
import type { WhatsAppLine } from "../config.js";
import {
  appendMessage,
  getOrCreateLead,
  messageCount,
  saveLeadContext,
  saveLeadLine,
  saveLeadName,
} from "../db/store.js";
import { parseDiscoveryPayload } from "../lead/parse.js";
import { log } from "../util/log.js";
import { todayAgendaText } from "../scheduler/digest.js";
import { sendText } from "./send.js";

function phoneFrom(jid: string): string {
  return jid.split("@")[0] ?? jid;
}

/**
 * ¿El número que escribe es uno de nuestros propios asesores? Cualquier
 * línea configurada cuenta como "operador" —Mauricio puede pedir la agenda
 * escribiéndole a su propia línea o a la del otro asesor, da igual cuál.
 */
function isOperatorPhone(phone: string, lines: WhatsAppLine[]): boolean {
  return lines.some((line) => line.number === phone);
}

/** Comandos que solo responden los números de los asesores. */
async function handleOperatorCommand(sock: WASocket, jid: string, text: string): Promise<boolean> {
  const command = text.trim().toLowerCase();

  if (command === "agenda" || command === "hoy" || command === "/agenda") {
    const agenda = await todayAgendaText();
    await sendText(sock, jid, agenda);
    return true;
  }

  return false;
}

export async function handleMessage(
  sock: WASocket,
  line: WhatsAppLine,
  jid: string,
  text: string,
  pushName: string | null,
  allLines: WhatsAppLine[],
): Promise<void> {
  const phone = phoneFrom(jid);

  if (isOperatorPhone(phone, allLines)) {
    const handled = await handleOperatorCommand(sock, jid, text);
    if (handled) return;
  }

  const lead = getOrCreateLead(jid, phone, pushName);
  saveLeadLine(jid, line.number);

  const isFirstMessage = messageCount(jid) === 0;

  /* El primer mensaje puede traer el diagnostico del landing. Se guarda como
   * contexto en vez de tratarse como una pregunta cualquiera. */
  if (isFirstMessage) {
    const context = parseDiscoveryPayload(text);

    if (context) {
      saveLeadContext(jid, context);
      if (pushName && !lead.name) saveLeadName(jid, pushName);

      log.info(
        { jid, line: line.name, track: context.track, profile: context.profile },
        "Lead con Discovery",
      );

      /* El payload no se manda al modelo como turno de usuario: ya vive en el
       * system prompt. Se registra un turno legible para que el historial
       * tenga sentido si alguien lo revisa despues. */
      appendMessage(jid, "user", "[Llega desde el Discovery de la web]");

      const refreshed = getOrCreateLead(jid, phone, pushName);
      const opening = await runAgent(refreshed, "Salúdame y arranca la conversación.");
      await sendText(sock, jid, opening);
      return;
    }

    log.info({ jid, line: line.name }, "Lead sin Discovery previo");
  }

  const reply = await runAgent(lead, text);
  await sendText(sock, jid, reply);
}

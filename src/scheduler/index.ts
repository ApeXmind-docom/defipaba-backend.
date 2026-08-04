import type { WASocket } from "@whiskeysockets/baileys";

import { config, type WhatsAppLine } from "../config.js";
import {
  digestAlreadySent,
  dueReminders,
  leadLineNumber,
  markDigestSent,
  markReminderSent,
} from "../db/store.js";
import { humanize, humanizeTime, zonedParts } from "../util/time.js";
import { log } from "../util/log.js";
import { sendText } from "../whatsapp/send.js";
import { todayAgendaText, todayRange } from "./digest.js";

const TICK_MS = 60_000;

function reminderText(startsAt: number, hoursBefore: number, name: string | null): string {
  const tz = config.agenda.timezone;
  const when = new Date(startsAt);
  const greeting = name ? `Hola ${name.split(" ")[0]}` : "Hola";

  if (hoursBefore <= 2) {
    return `${greeting}, te escribo para recordarte que nuestra reunión es hoy a las ${humanizeTime(when, tz)}. Nos vemos en un rato.`;
  }

  return `${greeting}, un recordatorio de nuestra reunión: ${humanize(when, tz)}. Si necesitas moverla, dime y buscamos otro espacio.`;
}

/**
 * El socket correcto para responderle a un lead: la línea por la que
 * escribió por última vez. Si esa línea no está disponible (se cayó, o el
 * dato no quedó registrado por alguna razón), cae a la primera línea activa
 * en vez de perder el recordatorio.
 */
function socketFor(jid: string, sockets: Map<string, WASocket>): WASocket | null {
  const preferred = leadLineNumber(jid);
  if (preferred) {
    const sock = sockets.get(preferred);
    if (sock) return sock;
  }
  return sockets.values().next().value ?? null;
}

async function runReminders(sockets: Map<string, WASocket>): Promise<void> {
  const due = dueReminders(Date.now());

  for (const reminder of due) {
    /* Se marca antes de enviar: si el proceso muere a mitad, se pierde un
     * recordatorio en lugar de mandarlo repetido en cada tick al reiniciar. */
    markReminderSent(reminder.id);

    const sock = socketFor(reminder.jid, sockets);
    if (!sock) {
      log.error({ jid: reminder.jid }, "Sin ninguna linea de WhatsApp activa para el recordatorio");
      continue;
    }

    await sendText(sock, reminder.jid, reminderText(reminder.startsAt, reminder.hoursBefore, reminder.name));
    log.info({ jid: reminder.jid, hoursBefore: reminder.hoursBefore }, "Recordatorio enviado");
  }
}

/**
 * Cada asesor recibe el resumen del día en su propia línea —un mensaje a sí
 * mismo, como el "Mensaje para ti" de WhatsApp— en vez de que le llegue desde
 * el número de otra persona. El envío se rastrea por línea: si una falla,
 * reintenta sólo esa, sin repetir el resumen a la que ya lo recibió.
 */
async function runDigest(lines: WhatsAppLine[], sockets: Map<string, WASocket>): Promise<void> {
  const now = new Date();
  const parts = zonedParts(now, config.agenda.timezone);
  if (parts.hour < config.reminders.digestHour) return;

  const { dayKey } = todayRange(now);
  let agenda: string | null = null;

  for (const line of lines) {
    const lineDayKey = `${dayKey}:${line.number}`;
    if (digestAlreadySent(lineDayKey)) continue;

    const sock = sockets.get(line.number);
    if (!sock) continue;

    try {
      agenda ??= await todayAgendaText(now);
      const selfJid = `${line.number}@s.whatsapp.net`;
      await sendText(sock, selfJid, agenda);
      markDigestSent(lineDayKey);
      log.info({ dayKey, line: line.name }, "Resumen diario enviado");
    } catch (error) {
      log.error({ error, line: line.name }, "Fallo al enviar el resumen diario");
    }
  }
}

export function startScheduler(lines: WhatsAppLine[], sockets: Map<string, WASocket>): NodeJS.Timeout {
  const tick = async () => {
    try {
      await runReminders(sockets);
      await runDigest(lines, sockets);
    } catch (error) {
      log.error({ error }, "Fallo en el ciclo del planificador");
    }
  };

  void tick();
  return setInterval(() => void tick(), TICK_MS);
}

import { config } from "../config.js";
import { agendaBetween } from "../db/store.js";
import { TRACK_LABEL, type Track } from "../lead/types.js";
import { fromZoned, humanizeTime, zonedParts } from "../util/time.js";

/** Rango [inicio, fin) del dia local actual. */
export function todayRange(now = new Date()): { from: Date; to: Date; dayKey: string } {
  const tz = config.agenda.timezone;
  const parts = zonedParts(now, tz);

  const from = fromZoned({ year: parts.year, month: parts.month, day: parts.day, hour: 0 }, tz);
  const to = new Date(from.getTime() + 86_400_000);
  const dayKey = `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;

  return { from, to, dayKey };
}

function describeLead(name: string | null, phone: string, profile: string | null, track: string | null): string {
  const who = name?.trim() || `+${phone}`;
  const trackLabel = track && track in TRACK_LABEL ? TRACK_LABEL[track as Track] : null;

  const tag = [profile, trackLabel].filter(Boolean).join(" · ");
  return tag ? `${who} — ${tag}` : who;
}

/**
 * Resumen del dia para los asesores.
 *
 * Lee de la base local (agenda interna, sin calendario externo): sólo ve lo
 * que PABA mismo agendó. Cualquier reunión que se haya puesto a mano por
 * fuera de WhatsApp no aparece aquí — es el costo de no depender de una
 * cuenta de Google Cloud.
 */
export async function todayAgendaText(now = new Date()): Promise<string> {
  const { from, to } = todayRange(now);
  const tz = config.agenda.timezone;

  const items = agendaBetween(from.getTime(), to.getTime());

  if (items.length === 0) {
    return "Hoy no tienes reuniones agendadas.";
  }

  const lines = items.map((item) => {
    const start = humanizeTime(new Date(item.startsAt), tz);
    const end = humanizeTime(new Date(item.endsAt), tz);
    const who = describeLead(item.name, item.phone, item.profile, item.track);
    return `• ${start} – ${end}  ${who}`;
  });

  const header =
    items.length === 1 ? "Hoy tienes 1 reunión:" : `Hoy tienes ${items.length} reuniones:`;

  return `${header}\n\n${lines.join("\n")}`;
}

import type Anthropic from "@anthropic-ai/sdk";

import { config } from "../config.js";
import { getBusyIntervals } from "../calendar/local.js";
import { computeSlots } from "../calendar/slots.js";
import { createBooking, saveLeadEmail, saveLeadName } from "../db/store.js";
import type { Lead } from "../lead/types.js";
import { addMinutes, humanize } from "../util/time.js";
import { log } from "../util/log.js";

export const TOOLS: Anthropic.Tool[] = [
  {
    name: "consultar_disponibilidad",
    description:
      "Devuelve los horarios libres reales para una reunion de 30 minutos. " +
      "Usala siempre antes de proponer una hora. Nunca inventes horarios.",
    input_schema: {
      type: "object",
      properties: {
        dias: {
          type: "integer",
          description:
            "Cuantos dias hacia adelante mirar. Por defecto 10. Usa un numero menor si la persona pidio algo pronto.",
        },
      },
      required: [],
    },
  },
  {
    name: "agendar_reunion",
    description:
      "Crea la reunion en el calendario. Usala solo cuando la persona haya " +
      "elegido uno de los horarios que devolvio consultar_disponibilidad y " +
      "tengas su nombre.",
    input_schema: {
      type: "object",
      properties: {
        inicio: {
          type: "string",
          description:
            "Momento de inicio en ISO 8601, exactamente como lo devolvio consultar_disponibilidad en el campo 'valor'.",
        },
        nombre: {
          type: "string",
          description: "Nombre de la persona, para el titulo del evento.",
        },
        correo: {
          type: "string",
          description: "Correo, si lo compartio. Omitir si no lo dio.",
        },
      },
      required: ["inicio", "nombre"],
    },
  },
];

/** Huecos ofrecidos en el turno actual, para validar la eleccion. */
const offered = new Map<string, Set<number>>();

async function runAvailability(lead: Lead, days: number | undefined): Promise<string> {
  const horizon = Math.min(Math.max(days ?? config.agenda.horizonDays, 1), 30);
  const now = new Date();
  const until = new Date(now.getTime() + horizon * 86_400_000);

  const busy = getBusyIntervals(now, until);

  const slots = computeSlots({
    now,
    busy,
    timezone: config.agenda.timezone,
    workDays: [...config.agenda.workDays],
    startHour: config.agenda.startHour,
    endHour: config.agenda.endHour,
    meetingMinutes: config.agenda.meetingMinutes,
    leadTimeHours: config.agenda.leadTimeHours,
    horizonDays: horizon,
    limit: config.agenda.maxSlotsOffered,
  });

  offered.set(lead.jid, new Set(slots.map((s) => s.getTime())));

  if (slots.length === 0) {
    return JSON.stringify({
      disponibles: [],
      nota: "No hay huecos en el rango consultado. Ofrece avisarle cuando se abra espacio.",
    });
  }

  return JSON.stringify({
    zona: config.agenda.timezone,
    duracion_minutos: config.agenda.meetingMinutes,
    disponibles: slots.map((slot) => ({
      valor: slot.toISOString(),
      texto: humanize(slot, config.agenda.timezone),
    })),
  });
}

async function runBooking(
  lead: Lead,
  input: { inicio?: unknown; nombre?: unknown; correo?: unknown },
): Promise<string> {
  const isoStart = typeof input.inicio === "string" ? input.inicio : "";
  const name = typeof input.nombre === "string" ? input.nombre.trim() : "";
  const email = typeof input.correo === "string" ? input.correo.trim() : "";

  const start = new Date(isoStart);
  if (Number.isNaN(start.getTime())) {
    return JSON.stringify({ ok: false, error: "El campo 'inicio' no es una fecha valida." });
  }
  if (!name) {
    return JSON.stringify({ ok: false, error: "Falta el nombre. Pideselo antes de agendar." });
  }

  /* El modelo solo puede reservar un hueco que la herramienta ofrecio en esta
   * conversacion. Sin esta validacion podria inventar una hora plausible. */
  const allowed = offered.get(lead.jid);
  if (!allowed || !allowed.has(start.getTime())) {
    return JSON.stringify({
      ok: false,
      error:
        "Ese horario no esta entre los que devolvio consultar_disponibilidad. " +
        "Vuelve a consultar la disponibilidad y ofrece uno de los valores exactos.",
    });
  }

  if (start.getTime() < Date.now()) {
    return JSON.stringify({ ok: false, error: "Ese horario ya paso." });
  }

  const end = addMinutes(start, config.agenda.meetingMinutes);

  try {
    saveLeadName(lead.jid, name);
    if (email) saveLeadEmail(lead.jid, email);

    /* Sin calendario externo no hay un id de evento que nos devuelvan: se
     * genera uno propio para identificar la reserva internamente. */
    const localEventId = `local-${crypto.randomUUID()}`;

    createBooking(
      lead.jid,
      localEventId,
      start.getTime(),
      end.getTime(),
      [...config.reminders.hoursBefore],
    );

    offered.delete(lead.jid);

    return JSON.stringify({
      ok: true,
      confirmado: humanize(start, config.agenda.timezone),
      nota: "Reunion creada. El sistema envia la confirmacion detallada aparte, no la repitas.",
    });
  } catch (error) {
    log.error({ error, jid: lead.jid }, "Fallo al crear la reserva");
    return JSON.stringify({
      ok: false,
      error:
        "No se pudo crear la reunion por un problema tecnico. Discupate, " +
        "ofrece intentarlo de nuevo en un momento y no inventes una confirmacion.",
    });
  }
}

export async function executeTool(
  lead: Lead,
  name: string,
  input: Record<string, unknown>,
): Promise<string> {
  switch (name) {
    case "consultar_disponibilidad":
      return runAvailability(lead, typeof input.dias === "number" ? input.dias : undefined);
    case "agendar_reunion":
      return runBooking(lead, input);
    default:
      return JSON.stringify({ ok: false, error: `Herramienta desconocida: ${name}` });
  }
}

/** Devuelve el inicio de la reunion recien creada, si la hubo en este turno. */
export function clearOffered(jid: string): void {
  offered.delete(jid);
}

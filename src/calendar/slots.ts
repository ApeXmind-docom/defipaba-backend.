import { addMinutes, fromZoned, zonedParts } from "../util/time.js";

export interface Interval {
  start: number;
  end: number;
}

export interface SlotOptions {
  now: Date;
  busy: Interval[];
  timezone: string;
  /** 1 = lunes ... 7 = domingo */
  workDays: number[];
  startHour: number;
  endHour: number;
  meetingMinutes: number;
  leadTimeHours: number;
  horizonDays: number;
  limit: number;
}

function overlaps(start: number, end: number, busy: Interval[]): boolean {
  return busy.some((b) => start < b.end && end > b.start);
}

/**
 * Calcula los huecos libres que se le pueden ofrecer a una persona.
 *
 * Funcion pura: no toca red ni reloj global. Todo lo que necesita entra por
 * parametro, asi que su comportamiento se puede fijar en pruebas.
 */
export function computeSlots(options: SlotOptions): Date[] {
  const {
    now, busy, timezone, workDays, startHour, endHour,
    meetingMinutes, leadTimeHours, horizonDays, limit,
  } = options;

  const earliest = now.getTime() + leadTimeHours * 3600_000;
  const slots: Date[] = [];

  for (let dayOffset = 0; dayOffset <= horizonDays; dayOffset++) {
    if (slots.length >= limit) break;

    const dayAnchor = new Date(now.getTime() + dayOffset * 86_400_000);
    const parts = zonedParts(dayAnchor, timezone);
    if (!workDays.includes(parts.weekday)) continue;

    for (let minute = startHour * 60; minute + meetingMinutes <= endHour * 60; minute += meetingMinutes) {
      if (slots.length >= limit) break;

      const start = fromZoned(
        {
          year: parts.year,
          month: parts.month,
          day: parts.day,
          hour: Math.floor(minute / 60),
          minute: minute % 60,
        },
        timezone,
      );

      const startMs = start.getTime();
      if (startMs < earliest) continue;

      const endMs = addMinutes(start, meetingMinutes).getTime();
      if (overlaps(startMs, endMs, busy)) continue;

      slots.push(start);
    }
  }

  return slots;
}

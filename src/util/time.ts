/**
 * Utilidades de zona horaria sin dependencias.
 *
 * Colombia no aplica horario de verano, pero el codigo no lo asume: todo se
 * calcula con `Intl`, asi que cambiar TIMEZONE a una zona con DST sigue
 * funcionando.
 */

export interface Parts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number; // 1 = lunes ... 7 = domingo
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Desfase de la zona respecto a UTC, en minutos, para un instante dado. */
export function offsetMinutes(date: Date, timezone: string): number {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const map: Record<string, string> = {};
  for (const part of fmt.formatToParts(date)) map[part.type] = part.value;

  const asUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour) === 24 ? 0 : Number(map.hour),
    Number(map.minute),
    Number(map.second),
  );

  return (asUtc - date.getTime()) / 60000;
}

/** Descompone un instante en la hora de pared de la zona. */
export function zonedParts(date: Date, timezone: string): Parts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour12: false,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  const map: Record<string, string> = {};
  for (const part of fmt.formatToParts(date)) map[part.type] = part.value;

  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour) === 24 ? 0 : Number(map.hour),
    minute: Number(map.minute),
    weekday: WEEKDAYS.indexOf(String(map.weekday)) + 1,
  };
}

/**
 * Construye un instante a partir de una hora de pared en la zona indicada.
 * Se itera dos veces porque el desfase depende del propio instante y en los
 * bordes de cambio horario la primera estimacion puede quedarse corta.
 */
export function fromZoned(
  parts: { year: number; month: number; day: number; hour: number; minute?: number },
  timezone: string,
): Date {
  const naive = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute ?? 0,
  );

  let result = new Date(naive - offsetMinutes(new Date(naive), timezone) * 60000);
  result = new Date(naive - offsetMinutes(result, timezone) * 60000);
  return result;
}

const DAY_NAMES = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"];
const MONTH_NAMES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/** "jueves 7 de agosto, 10:30 a. m." */
export function humanize(date: Date, timezone: string): string {
  const p = zonedParts(date, timezone);
  return `${DAY_NAMES[p.weekday - 1]} ${p.day} de ${MONTH_NAMES[p.month - 1]}, ${humanizeTime(date, timezone)}`;
}

/** "10:30 a. m." */
export function humanizeTime(date: Date, timezone: string): string {
  const p = zonedParts(date, timezone);
  const h12 = p.hour % 12 === 0 ? 12 : p.hour % 12;
  const suffix = p.hour < 12 ? "a. m." : "p. m.";
  return `${h12}:${String(p.minute).padStart(2, "0")} ${suffix}`;
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60000);
}

export function sameZonedDay(a: Date, b: Date, timezone: string): boolean {
  const pa = zonedParts(a, timezone);
  const pb = zonedParts(b, timezone);
  return pa.year === pb.year && pa.month === pb.month && pa.day === pb.day;
}

import "dotenv/config";

/* Se acumulan todas las variables ausentes para reportarlas juntas. Descubrir
 * una, arreglarla y volver a fallar por la siguiente es una perdida de tiempo. */
const missing: string[] = [];

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    missing.push(name);
    return "";
  }
  return value;
}

function reportMissing(): void {
  if (missing.length === 0) return;
  console.error(
    [
      "",
      "No se puede arrancar: faltan variables de entorno.",
      "",
      ...missing.map((name) => `  - ${name}`),
      "",
      "Copia .env.example a .env y rellena los valores.",
      "",
    ].join("\n"),
  );
  process.exit(1);
}

function optional(name: string, fallback: string): string {
  return process.env[name] || fallback;
}

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (Number.isNaN(parsed)) throw new Error(`${name} debe ser un numero`);
  return parsed;
}

/**
 * Líneas de WhatsApp configuradas. Cada asesor tiene su propio número —y por
 * tanto su propia sesión, ya que no existe forma de fusionar dos números
 * reales en una sola conexión de WhatsApp— pero todas comparten el mismo
 * cerebro (Claude, la base de leads, el calendario). Se leen dinámicamente:
 *
 *   WHATSAPP_LINE_1_NAME=Mauricio
 *   WHATSAPP_LINE_1_NUMBER=573136439020
 *   WHATSAPP_LINE_2_NAME=Asesor 2
 *   WHATSAPP_LINE_2_NUMBER=573003615111
 *
 * Con una sola línea configurada el sistema funciona igual que antes de
 * soportar varias.
 */
export interface WhatsAppLine {
  name: string;
  number: string;
  sessionDir: string;
}

function parseLines(baseSessionDir: string): WhatsAppLine[] {
  const lines: WhatsAppLine[] = [];

  for (let i = 1; ; i++) {
    const number = process.env[`WHATSAPP_LINE_${i}_NUMBER`];
    if (!number) break;

    const name = process.env[`WHATSAPP_LINE_${i}_NAME`]?.trim() || `Línea ${i}`;
    const cleanNumber = number.trim();
    lines.push({ name, number: cleanNumber, sessionDir: `${baseSessionDir}/line-${cleanNumber}` });
  }

  if (lines.length === 0) missing.push("WHATSAPP_LINE_1_NUMBER");
  return lines;
}

export const config = {
  anthropic: {
    apiKey: required("ANTHROPIC_API_KEY"),
    model: optional("ANTHROPIC_MODEL", "claude-haiku-4-5-20251001"),
    maxTokens: num("ANTHROPIC_MAX_TOKENS", 700),
    /** Corta la conversacion antes de que el historial se vuelva caro. */
    maxHistoryMessages: num("MAX_HISTORY_MESSAGES", 24),
  },

  agenda: {
    timezone: optional("TIMEZONE", "America/Bogota"),
    /** Dias habiles. 1 = lunes ... 7 = domingo (ISO). */
    workDays: optional("WORK_DAYS", "1,2,3,4,5")
      .split(",")
      .map((d) => Number(d.trim()))
      .filter((d) => d >= 1 && d <= 7),
    startHour: num("WORK_START_HOUR", 9),
    endHour: num("WORK_END_HOUR", 18),
    meetingMinutes: num("MEETING_MINUTES", 30),
    /** Margen minimo entre "ahora" y el primer hueco ofrecido. */
    leadTimeHours: num("LEAD_TIME_HOURS", 3),
    /** Cuantos dias hacia adelante se ofrecen huecos. */
    horizonDays: num("HORIZON_DAYS", 10),
    /** Maximo de huecos que se le muestran a una persona de una vez. */
    maxSlotsOffered: num("MAX_SLOTS_OFFERED", 6),
  },

  reminders: {
    /** Horas antes de la reunion en las que se avisa. */
    hoursBefore: optional("REMINDER_HOURS_BEFORE", "24,1")
      .split(",")
      .map((h) => Number(h.trim()))
      .filter((h) => h > 0)
      .sort((a, b) => b - a),
    /** Hora local a la que se envia el resumen del dia al operador. */
    digestHour: num("DIGEST_HOUR", 7),
  },

  whatsapp: {
    lines: parseLines(optional("SESSION_DIR", "./auth")),
    /** Pausas de envio. Escribir instantaneamente es una senal de bot. */
    minDelayMs: num("SEND_MIN_DELAY_MS", 900),
    maxDelayMs: num("SEND_MAX_DELAY_MS", 2600),
  },

  dbPath: optional("DB_PATH", "./data/paba.db"),
  logLevel: optional("LOG_LEVEL", "info"),

  panel: {
    /** Render asigna este puerto automaticamente en un Web Service. */
    port: num("PORT", 3000),
    /** Contraseña compartida del panel. Sin ella, el panel no arranca. */
    password: required("PANEL_PASSWORD"),
  },
} as const;

reportMissing();

export type Config = typeof config;

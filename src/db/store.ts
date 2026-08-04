import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { config } from "../config.js";
import type { Lead, LeadContext } from "../lead/types.js";

mkdirSync(dirname(config.dbPath), { recursive: true });

const db = new Database(config.dbPath);
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS leads (
  jid          TEXT PRIMARY KEY,
  phone        TEXT NOT NULL,
  name         TEXT,
  email        TEXT,
  profile      TEXT,
  interest     TEXT,
  defi_level   TEXT,
  ai_level     TEXT,
  goal         TEXT,
  disposition  TEXT,
  track        TEXT,
  line_number  TEXT,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  jid        TEXT NOT NULL,
  role       TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content    TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_jid ON messages (jid, id);

CREATE TABLE IF NOT EXISTS bookings (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  jid        TEXT NOT NULL,
  event_id   TEXT NOT NULL UNIQUE,
  starts_at  INTEGER NOT NULL,
  ends_at    INTEGER NOT NULL,
  status     TEXT NOT NULL DEFAULT 'confirmed',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_bookings_start ON bookings (starts_at);

CREATE TABLE IF NOT EXISTS reminders (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  jid        TEXT NOT NULL,
  fire_at    INTEGER NOT NULL,
  hours_before INTEGER NOT NULL,
  sent_at    INTEGER,
  UNIQUE (booking_id, hours_before)
);
CREATE INDEX IF NOT EXISTS idx_reminders_due ON reminders (fire_at, sent_at);

CREATE TABLE IF NOT EXISTS digests (
  day_key  TEXT PRIMARY KEY,
  sent_at  INTEGER NOT NULL
);
`);

/* Migracion defensiva: si la base ya existia sin `line_number` (creada antes
 * de soportar varias lineas), se agrega la columna. `CREATE TABLE IF NOT
 * EXISTS` no altera tablas existentes, asi que esto cubre ese caso sin tocar
 * los datos ya guardados. */
try {
  db.exec("ALTER TABLE leads ADD COLUMN line_number TEXT");
} catch {
  /* La columna ya existe: nada que hacer. */
}

/* ------------------------------------------------------------------ leads */

interface LeadRow {
  jid: string;
  phone: string;
  name: string | null;
  email: string | null;
  profile: string | null;
  interest: string | null;
  defi_level: string | null;
  ai_level: string | null;
  goal: string | null;
  disposition: string | null;
  track: string | null;
  line_number: string | null;
  created_at: number;
  updated_at: number;
}

function toLead(row: LeadRow): Lead {
  return {
    jid: row.jid,
    phone: row.phone,
    name: row.name,
    email: row.email,
    profile: row.profile ?? undefined,
    interest: row.interest ?? undefined,
    defiLevel: row.defi_level ?? undefined,
    aiLevel: row.ai_level ?? undefined,
    goal: row.goal ?? undefined,
    disposition: row.disposition ?? undefined,
    track: (row.track as Lead["track"]) ?? undefined,
    lineNumber: row.line_number ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const selectLead = db.prepare<[string], LeadRow>("SELECT * FROM leads WHERE jid = ?");

const insertLead = db.prepare(`
  INSERT INTO leads (jid, phone, name, created_at, updated_at)
  VALUES (@jid, @phone, @name, @now, @now)
  ON CONFLICT(jid) DO NOTHING
`);

export function getOrCreateLead(jid: string, phone: string, name: string | null): Lead {
  insertLead.run({ jid, phone, name, now: Date.now() });
  return toLead(selectLead.get(jid)!);
}

const updateLine = db.prepare("UPDATE leads SET line_number = ?, updated_at = ? WHERE jid = ?");

/**
 * Registra por cuál de nuestras líneas llegó el último mensaje de este lead.
 * Se llama en cada mensaje entrante —no sólo al crear el lead— para que si
 * alguna vez escribe por otra línea, los recordatorios sigan yendo por la
 * línea correcta (la más reciente), no por la primera que usó.
 */
export function saveLeadLine(jid: string, lineNumber: string): void {
  updateLine.run(lineNumber, Date.now(), jid);
}

const selectLeadLine = db.prepare<[string], { line_number: string | null }>(
  "SELECT line_number FROM leads WHERE jid = ?",
);

/** Línea por la que hay que responderle a este lead (recordatorios, etc). */
export function leadLineNumber(jid: string): string | null {
  return selectLeadLine.get(jid)?.line_number ?? null;
}

const updateContext = db.prepare(`
  UPDATE leads SET
    profile = @profile, interest = @interest, defi_level = @defiLevel,
    ai_level = @aiLevel, goal = @goal, disposition = @disposition,
    track = @track, updated_at = @now
  WHERE jid = @jid
`);

export function saveLeadContext(jid: string, context: LeadContext): void {
  updateContext.run({ ...context, jid, now: Date.now() });
}

const updateName = db.prepare("UPDATE leads SET name = ?, updated_at = ? WHERE jid = ?");
const updateEmail = db.prepare("UPDATE leads SET email = ?, updated_at = ? WHERE jid = ?");

export function saveLeadName(jid: string, name: string): void {
  updateName.run(name, Date.now(), jid);
}

export function saveLeadEmail(jid: string, email: string): void {
  updateEmail.run(email, Date.now(), jid);
}

/* --------------------------------------------------------------- mensajes */

const insertMessage = db.prepare(
  "INSERT INTO messages (jid, role, content, created_at) VALUES (?, ?, ?, ?)",
);

export function appendMessage(jid: string, role: "user" | "assistant", content: string): void {
  insertMessage.run(jid, role, content, Date.now());
}

const selectHistory = db.prepare<[string, number], { role: string; content: string }>(`
  SELECT role, content FROM (
    SELECT role, content, id FROM messages WHERE jid = ? ORDER BY id DESC LIMIT ?
  ) ORDER BY id ASC
`);

export function getHistory(jid: string, limit: number): Array<{ role: "user" | "assistant"; content: string }> {
  return selectHistory.all(jid, limit).map((row) => ({
    role: row.role as "user" | "assistant",
    content: row.content,
  }));
}

const countMessages = db.prepare<[string], { n: number }>(
  "SELECT COUNT(*) AS n FROM messages WHERE jid = ?",
);

export function messageCount(jid: string): number {
  return countMessages.get(jid)?.n ?? 0;
}

/* --------------------------------------------------------------- reservas */

export interface Booking {
  id: number;
  jid: string;
  eventId: string;
  startsAt: number;
  endsAt: number;
  status: string;
}

const insertBooking = db.prepare(`
  INSERT INTO bookings (jid, event_id, starts_at, ends_at, created_at)
  VALUES (?, ?, ?, ?, ?)
`);

const insertReminder = db.prepare(`
  INSERT INTO reminders (booking_id, jid, fire_at, hours_before)
  VALUES (?, ?, ?, ?)
  ON CONFLICT (booking_id, hours_before) DO NOTHING
`);

/**
 * Guarda la reserva y programa sus recordatorios en la misma transaccion.
 * Si algo falla, no queda una reunion sin avisos ni avisos sin reunion.
 */
export const createBooking = db.transaction(
  (jid: string, eventId: string, startsAt: number, endsAt: number, hoursBefore: number[]): number => {
    const info = insertBooking.run(jid, eventId, startsAt, endsAt, Date.now());
    const bookingId = Number(info.lastInsertRowid);

    for (const hours of hoursBefore) {
      const fireAt = startsAt - hours * 3600_000;
      // Un recordatorio cuyo momento ya paso no se programa.
      if (fireAt > Date.now()) insertReminder.run(bookingId, jid, fireAt, hours);
    }

    return bookingId;
  },
);

const selectUpcomingForLead = db.prepare<[string, number], { starts_at: number }>(
  "SELECT starts_at FROM bookings WHERE jid = ? AND starts_at > ? AND status = 'confirmed' ORDER BY starts_at LIMIT 1",
);

export function nextBookingFor(jid: string): Date | null {
  const row = selectUpcomingForLead.get(jid, Date.now());
  return row ? new Date(row.starts_at) : null;
}

const selectBookingsBetween = db.prepare<[number, number], {
  id: number; jid: string; event_id: string; starts_at: number; ends_at: number; status: string;
}>(
  "SELECT * FROM bookings WHERE starts_at >= ? AND starts_at < ? AND status = 'confirmed' ORDER BY starts_at",
);

export function bookingsBetween(from: number, to: number): Booking[] {
  return selectBookingsBetween.all(from, to).map((row) => ({
    id: row.id,
    jid: row.jid,
    eventId: row.event_id,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    status: row.status,
  }));
}

export interface AgendaItem {
  name: string | null;
  phone: string;
  profile: string | null;
  track: string | null;
  startsAt: number;
  endsAt: number;
}

const selectAgenda = db.prepare<[number, number], {
  starts_at: number; ends_at: number; name: string | null; phone: string; profile: string | null; track: string | null;
}>(`
  SELECT b.starts_at, b.ends_at, l.name, l.phone, l.profile, l.track
  FROM bookings b
  LEFT JOIN leads l ON l.jid = b.jid
  WHERE b.starts_at >= ? AND b.starts_at < ? AND b.status = 'confirmed'
  ORDER BY b.starts_at
`);

/**
 * Reuniones del día con quién es cada una — nombre, perfil y ruta del lead
 * si los tiene. Reemplaza la necesidad de leer un calendario externo: toda
 * la agenda vive aquí, en la misma base que ya guarda los leads.
 */
export function agendaBetween(from: number, to: number): AgendaItem[] {
  return selectAgenda.all(from, to).map((row) => ({
    name: row.name,
    phone: row.phone,
    profile: row.profile,
    track: row.track,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
  }));
}

/* ---------------------------------------------------------- recordatorios */

export interface DueReminder {
  id: number;
  jid: string;
  hoursBefore: number;
  startsAt: number;
  name: string | null;
}

const selectDue = db.prepare<[number], {
  id: number; jid: string; hours_before: number; starts_at: number; name: string | null;
}>(`
  SELECT r.id, r.jid, r.hours_before, b.starts_at, l.name
  FROM reminders r
  JOIN bookings b ON b.id = r.booking_id
  LEFT JOIN leads l ON l.jid = r.jid
  WHERE r.sent_at IS NULL AND r.fire_at <= ? AND b.status = 'confirmed'
  ORDER BY r.fire_at
`);

export function dueReminders(now: number): DueReminder[] {
  return selectDue.all(now).map((row) => ({
    id: row.id,
    jid: row.jid,
    hoursBefore: row.hours_before,
    startsAt: row.starts_at,
    name: row.name,
  }));
}

const markReminder = db.prepare("UPDATE reminders SET sent_at = ? WHERE id = ?");

export function markReminderSent(id: number): void {
  markReminder.run(Date.now(), id);
}

/* -------------------------------------------------------- resumen diario */

const selectDigest = db.prepare<[string], { day_key: string }>(
  "SELECT day_key FROM digests WHERE day_key = ?",
);
const insertDigest = db.prepare("INSERT OR IGNORE INTO digests (day_key, sent_at) VALUES (?, ?)");

export function digestAlreadySent(dayKey: string): boolean {
  return selectDigest.get(dayKey) !== undefined;
}

export function markDigestSent(dayKey: string): void {
  insertDigest.run(dayKey, Date.now());
}

export function closeDb(): void {
  db.close();
}

export { db };

import type { LeadContext, Track } from "./types.js";

/** Quita tildes y normaliza para comparar etiquetas sin depender del acento. */
function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function field(lines: string[], label: string): string | null {
  const wanted = fold(label);
  for (const line of lines) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    if (fold(line.slice(0, idx)) === wanted) {
      const value = line.slice(idx + 1).trim();
      return value.length > 0 ? value : null;
    }
  }
  return null;
}

const TRACKS: Track[] = ["opportunity", "community", "services"];

/** Deduce la ruta cuando el mensaje no trae la linea `Ruta:` explicita. */
function inferTrack(interest: string | null): Track | null {
  if (!interest) return null;
  const value = fold(interest);
  if (value.includes("comunidad")) return "community";
  if (value.includes("oportunidad")) return "opportunity";
  if (value.includes("defi") || value.includes("servicio")) return "services";
  return null;
}

/**
 * Extrae el contexto del diagnostico del primer mensaje que llega del landing.
 *
 * Es deliberadamente tolerante: si la persona edita el mensaje antes de
 * enviarlo —cosa que WhatsApp permite— basta con que sobrevivan el perfil y la
 * ruta o el interes. Devuelve `null` si el mensaje no viene del Discovery, y
 * en ese caso PABA arranca una conversacion normal sin contexto previo.
 */
export function parseDiscoveryPayload(text: string): LeadContext | null {
  const lines = text.split(/\r?\n/).map((line) => line.trim());

  const profile = field(lines, "Perfil");
  if (!profile) return null;

  const interest = field(lines, "Interes");
  const rawTrack = field(lines, "Ruta");
  const track =
    rawTrack && TRACKS.includes(fold(rawTrack) as Track)
      ? (fold(rawTrack) as Track)
      : inferTrack(interest);

  if (!track) return null;

  return {
    profile,
    track,
    interest: interest ?? "",
    defiLevel: field(lines, "Nivel DeFi") ?? "",
    aiLevel: field(lines, "Nivel IA") ?? "",
    goal: field(lines, "Objetivo") ?? "",
    disposition: field(lines, "Disposicion") ?? "",
  };
}

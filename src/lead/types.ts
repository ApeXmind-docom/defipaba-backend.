export type Track = "opportunity" | "community" | "services";

export interface LeadContext {
  profile: string;
  interest: string;
  defiLevel: string;
  aiLevel: string;
  goal: string;
  disposition: string;
  track: Track;
}

export interface Lead extends Partial<LeadContext> {
  jid: string;
  phone: string;
  name: string | null;
  email: string | null;
  /** Número (nuestro) por el que este lead habló por última vez. */
  lineNumber?: string;
  createdAt: number;
  updatedAt: number;
}

export const TRACK_LABEL: Record<Track, string> = {
  opportunity: "Oportunidades",
  community: "Comunidad",
  services: "DeFi + IA",
};

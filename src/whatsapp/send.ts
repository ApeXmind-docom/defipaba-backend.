import type { WASocket } from "@whiskeysockets/baileys";

import { config } from "../config.js";
import { log } from "../util/log.js";

/**
 * Cola de envio serializada.
 *
 * Baileys es una libreria no oficial: enviar rafagas instantaneas es una de
 * las senales que mas rapido lleva a un bloqueo. Cada mensaje pasa por
 * "escribiendo...", espera un tiempo proporcional a su longitud y solo
 * entonces sale. Ademas todo el trafico va en serie, nunca en paralelo.
 */
let chain: Promise<void> = Promise.resolve();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function typingDelay(text: string): number {
  const { minDelayMs, maxDelayMs } = config.whatsapp;
  const estimate = 320 + text.length * 22;
  const jitter = Math.random() * 400;
  return Math.min(Math.max(estimate + jitter, minDelayMs), maxDelayMs);
}

/** Divide en burbujas por parrafo, como escribiria una persona. */
function bubbles(text: string): string[] {
  const parts = text
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts.slice(0, 3) : [text.trim()];
}

export function sendText(sock: WASocket, jid: string, text: string): Promise<void> {
  chain = chain
    .then(async () => {
      for (const bubble of bubbles(text)) {
        try {
          await sock.presenceSubscribe(jid);
          await sock.sendPresenceUpdate("composing", jid);
          await sleep(typingDelay(bubble));
          await sock.sendMessage(jid, { text: bubble });
          await sock.sendPresenceUpdate("paused", jid);
        } catch (error) {
          log.error({ error, jid }, "Fallo al enviar mensaje");
        }
      }
    })
    .catch((error) => {
      log.error({ error }, "Fallo en la cola de envio");
    });

  return chain;
}

import { config } from "./config.js";
import { closeDb } from "./db/store.js";
import { startScheduler } from "./scheduler/index.js";
import { startAllLines } from "./whatsapp/client.js";
import { handleMessage } from "./whatsapp/handler.js";
import { log } from "./util/log.js";

async function main(): Promise<void> {
  const lines = config.whatsapp.lines;

  log.info(
    {
      modelo: config.anthropic.model,
      zona: config.agenda.timezone,
      recordatorios: config.reminders.hoursBefore,
      lineas: lines.map((l) => `${l.name} (${l.number})`),
      agenda: "interna (sin calendario externo)",
    },
    "Arrancando PABA",
  );

  /* Todas las lineas comparten el mismo cerebro: se cierra sobre `lines` para
   * que cualquier linea pueda reconocer un mensaje entrante de OTRO asesor
   * como comando de operador (ej. "agenda"). */
  const sockets = await startAllLines(lines, (sock, line, jid, text, pushName) =>
    handleMessage(sock, line, jid, text, pushName, lines),
  );

  const timer = startScheduler(lines, sockets);

  const shutdown = (signal: string) => {
    log.info({ signal }, "Cerrando");
    clearInterval(timer);
    closeDb();
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((error) => {
  log.error({ error }, "Fallo al arrancar");
  process.exit(1);
});

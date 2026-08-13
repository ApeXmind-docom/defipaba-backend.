import { config } from "./config.js";
import { closeDb } from "./db/store.js";
import { startScheduler } from "./scheduler/index.js";
import { startServer } from "./server/index.js";
import { startAllLines } from "./whatsapp/client.js";
import { handleMessage } from "./whatsapp/handler.js";
import { log } from "./util/log.js";

/**
 * Sin esto, un tropiezo de red dentro de Baileys —por ejemplo un timeout al
 * inicializar una línea, que ya se ha visto en producción— tumba TODO el
 * proceso: el panel, la agenda, la otra línea si la hubiera, todo. Render
 * lo reinicia solo, pero tarda varios minutos, mucho más que los 4 segundos
 * que ya tiene programados el reintento interno de cada línea.
 *
 * Con esto en cambio, el error queda registrado en los logs pero el
 * servicio sigue de pie; la línea afectada se reconecta sola por su propia
 * lógica, sin arrastrar a las demás piezas del sistema con ella.
 */
process.on("unhandledRejection", (error) => {
  log.error({ error }, "Promesa rechazada sin capturar — el servicio sigue de pie");
});

process.on("uncaughtException", (error) => {
  log.error({ error }, "Excepcion sin capturar — el servicio sigue de pie");
});

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

  /* El panel necesita un puerto HTTP abierto para que Render lo considere un
   * Web Service saludable; se arranca antes de WhatsApp para que esté listo
   * incluso si escanear los QR toma un rato. */
  startServer();

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

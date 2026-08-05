import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import express from "express";

import { config } from "../config.js";
import { log } from "../util/log.js";
import { api } from "./api.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
/* Compilado: dist/server/index.js -> el panel estático vive en dist/public/panel */
const PANEL_DIR = join(__dirname, "..", "public", "panel");
const PANEL_INDEX = join(PANEL_DIR, "index.html");

export function startServer(): void {
  const app = express();

  /* Si esto sale en false al arrancar, el problema es del build —
   * `public/panel/index.html` no llegó a `dist/`— no del servidor en sí.
   * Revisa el log de build de Render: la línea de `copy-public.mjs` dice
   * exactamente si encontró la carpeta `public/` o no. */
  const panelExists = existsSync(PANEL_INDEX);
  log.info({ panelDir: PANEL_DIR, panelExists }, "Verificando archivos del panel");

  app.use(express.json());
  app.use("/api", api);
  app.use(express.static(PANEL_DIR));

  // Cualquier ruta que no sea /api sirve el panel: es una sola página.
  app.get(/^(?!\/api).*/, (_req, res) => {
    if (!panelExists) {
      res
        .status(503)
        .type("text/plain")
        .send(
          "El panel no se encontró en el build (dist/public/panel/index.html). " +
            "Revisa el log de build de Render: busca la línea de copy-public.mjs.",
        );
      return;
    }
    res.sendFile(PANEL_INDEX);
  });

  app.listen(config.panel.port, () => {
    log.info({ port: config.panel.port }, "Panel de control escuchando");
  });
}

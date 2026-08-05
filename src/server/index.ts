import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import express from "express";

import { config } from "../config.js";
import { log } from "../util/log.js";
import { api } from "./api.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
/* Compilado: dist/server/index.js -> el panel estático vive en dist/public/panel */
const PANEL_DIR = join(__dirname, "..", "public", "panel");

export function startServer(): void {
  const app = express();

  app.use(express.json());
  app.use("/api", api);
  app.use(express.static(PANEL_DIR));

  // Cualquier ruta que no sea /api sirve el panel: es una sola página.
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(join(PANEL_DIR, "index.html"));
  });

  app.listen(config.panel.port, () => {
    log.info({ port: config.panel.port }, "Panel de control escuchando");
  });
}

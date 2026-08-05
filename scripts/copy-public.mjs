// Copia los archivos estáticos del panel a dist/, ya que tsc sólo compila
// .ts y los deja fuera. Sin dependencias extra: usa fs.cp, disponible en
// Node 16.7+.
import { cp } from "node:fs/promises";
import { existsSync } from "node:fs";

const src = new URL("../public", import.meta.url);
const dest = new URL("../dist/public", import.meta.url);

if (existsSync(src)) {
  await cp(src, dest, { recursive: true });
  console.log("Panel estático copiado a dist/public");
} else {
  console.log("No hay carpeta public/ que copiar (no es un error).");
}

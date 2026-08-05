// Copia los archivos estáticos del panel a dist/, ya que tsc sólo compila
// .ts y los deja fuera. Sin dependencias extra: usa fs.cp, disponible en
// Node 16.7+.
import { cp, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const srcPath = fileURLToPath(new URL("../public", import.meta.url));
const destPath = fileURLToPath(new URL("../dist/public", import.meta.url));

console.log("copy-public: origen  =", srcPath);
console.log("copy-public: destino =", destPath);

if (existsSync(srcPath)) {
  await cp(srcPath, destPath, { recursive: true });
  const panelDir = join(destPath, "panel");
  const copied = await readdir(panelDir).catch(() => null);
  console.log(
    "copy-public: OK — archivos en dist/public/panel:",
    copied ? copied.join(", ") || "(carpeta vacía)" : "(no se encontró dist/public/panel)",
  );
} else {
  console.log("copy-public: no existe public/ en el origen — nada que copiar.");
  console.log("copy-public: si esperabas el panel, revisa que la carpeta 'public' llegó al repositorio.");
}

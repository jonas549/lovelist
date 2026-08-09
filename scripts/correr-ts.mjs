/**
 * Corre un script TypeScript suelto de scripts/.
 *
 * vite-node no sirve acá: levanta el vite.config del proyecto, que es el de la
 * app de React Router, y no resuelve archivos fuera de app/. Esto compila con
 * el esbuild que ya viene instalado y ejecuta el resultado.
 */
import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";

const entrada = process.argv[2];
if (!entrada) {
  console.error("uso: node scripts/correr-ts.mjs <archivo.ts>");
  process.exit(1);
}

// El compilado va DENTRO del proyecto, no al temp del sistema: las
// dependencias quedan externas y node las busca subiendo directorios desde el
// archivo que ejecuta. Desde el temp no encuentra node_modules.
const dir = mkdtempSync(join("node_modules", ".correr-ts-"));
const salida = join(dir, "script.mjs");

await build({
  entryPoints: [entrada],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  outfile: salida,
  // Las dependencias se dejan afuera: se resuelven desde node_modules como en
  // cualquier otro proceso de node.
  packages: "external",
});

try {
  await import(pathToFileURL(salida).href);
} finally {
  rmSync(dir, { recursive: true, force: true });
}

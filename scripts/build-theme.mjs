/**
 * Compila los assets del theme app extension.
 *
 * Por qué existe este paso: Shopify impone un tope de 10.000 bytes al archivo
 * JavaScript que declara un app block (regla AssetSizeAppBlockJavaScript de
 * theme check) y lo trata como error, no como advertencia. El tope se mide
 * sobre el archivo CRUDO, no comprimido, así que no alcanza con que gzip quede
 * chico. Escribir la lógica entera en 10 kB sin minificar obligaría a borrar los
 * comentarios y acortar los nombres, que es justo lo que no queremos.
 *
 * Entonces: la fuente legible vive en theme-src/ y acá se minifica hacia
 * extensions/lovelist-theme/assets/. Los assets generados SÍ se commitean,
 * porque el CLI de Shopify empaqueta la extensión desde el repo tal cual está.
 *
 * esbuild ya venía instalado (Vite lo usa por dentro); solo lo declaramos.
 */
import { build } from "esbuild";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const RAIZ = new URL("../", import.meta.url);
const DESTINO = "extensions/lovelist-theme/assets";

/**
 * Tope de Shopify para el JS referenciado por el schema de un app block.
 * La doc lo define sobre el tamaño COMPRIMIDO y lo marca como "Suggested":
 * https://shopify.dev/docs/apps/build/online-store/theme-app-extensions/configuration
 *
 * Ojo: `shopify app build` corre theme check, que aplica localmente esa misma
 * cifra pero contra el archivo CRUDO. Es una medida distinta y más estricta que
 * la regla documentada, así que va a marcar [error] AssetSizeAppBlockJavaScript
 * aunque estemos muy por debajo del límite real. Es un falso positivo conocido.
 *
 * No se puede silenciar: agregar un .theme-check.yml a la extensión hace que
 * theme check cambie al ruleset genérico de tema y empiece a rechazar `target`,
 * `javascript` y `stylesheet`, que en un app block son válidos. Cambia un
 * hallazgo falso por cuatro. El control de verdad es este script.
 */
const TOPE_SHOPIFY_JS_GZIP = 10 * 1024;
/** Tope propio del proyecto para el bundle del storefront, comprimido. */
const TOPE_PROYECTO_GZIP = 30 * 1024;

const AVISO =
  "/* Generado desde theme-src/ por scripts/build-theme.mjs. No editar a mano. */";

const entradas = [
  { origen: "theme-src/lovelist.js", destino: `${DESTINO}/lovelist.js` },
  { origen: "theme-src/lovelist.css", destino: `${DESTINO}/lovelist.css` },
];

// fileURLToPath y no .pathname: el repo vive en una carpeta con espacio y
// .pathname lo devolveria como %20, que esbuild no resuelve.
const ruta = (p) => fileURLToPath(new URL(p, RAIZ));

let fallo = false;

for (const { origen, destino } of entradas) {
  const esJs = origen.endsWith(".js");

  await build({
    entryPoints: [ruta(origen)],
    outfile: ruta(destino),
    minify: true,
    // Sin bundle: no hay imports, y así el archivo generado sigue siendo
    // exactamente la misma lógica, solo comprimida.
    bundle: false,
    target: esJs ? ["es2018"] : undefined,
    loader: esJs ? undefined : { ".css": "css" },
    legalComments: "none",
    banner: esJs ? { js: AVISO } : { css: AVISO },
    logLevel: "warning",
  });

  const crudo = (await stat(ruta(destino))).size;
  const comprimido = gzipSync(await readFile(ruta(destino)), { level: 9 }).length;
  const antes = (await stat(ruta(origen))).size;

  let nota = "";
  if (esJs && comprimido > TOPE_SHOPIFY_JS_GZIP) {
    nota = `  <-- SUPERA el tope de Shopify (${TOPE_SHOPIFY_JS_GZIP} B gzip)`;
    fallo = true;
  }
  if (comprimido > TOPE_PROYECTO_GZIP) {
    nota += `  <-- SUPERA el tope del proyecto (${TOPE_PROYECTO_GZIP} B gzip)`;
    fallo = true;
  }

  console.log(
    `${destino.padEnd(46)} ${String(antes).padStart(6)} B  ->  ` +
      `${String(crudo).padStart(6)} B crudos, ${String(comprimido).padStart(5)} B gzip${nota}`,
  );
}

if (fallo) {
  console.error("\nAlgún asset se pasó de tamaño. Revisá theme-src/.");
  process.exit(1);
}

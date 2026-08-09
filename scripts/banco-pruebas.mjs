/**
 * Banco de pruebas del JavaScript del storefront.
 *
 *   npm run test:theme     y abrir http://localhost:8787
 *
 * Sirve theme-src/banco-pruebas.html con los assets ya construidos. La página
 * simula varias formas de tarjeta de tema, un header estilo Dawn y la red, y
 * corre sus comprobaciones sola: el resultado queda en pantalla.
 *
 * Modos, y hay que pasar por todos:
 *   /                 invitado, primera visita, caché frío
 *   /  (recargando)   invitado, caché tibio: debe pintar sin pedir red
 *   /?sin-estado      sin nada guardado: no debe gastar ni una petición
 *   /?logueado        con sesión iniciada y favoritos de invitado: debe fusionar
 *   /?merge-falla     la fusión falla: debe conservar el anonymousId y reintentar
 *   /?pagina          la página completa: grilla, carrito, compartir y quitar
 *   /?pagina&sin-drawer      un tema SIN panel de carrito: tiene que terminar
 *                            en /cart, que funciona en todos los temas
 *   /?pagina&secciones-nulas hay panel, pero Shopify devuelve las secciones en
 *                            null: tampoco puede quedarse a medias, va a /cart
 *
 * Los dos últimos terminan navegando a propósito: aterrizar en /cart ES el
 * resultado. La página de destino la sirve este mismo script.
 *
 * Por qué existe: la primera versión de este banco daba todo en verde y aun así
 * se escaparon tres fallos a producción (los corazones no recordaban nada, el
 * contador terminaba dentro del menú móvil plegado de Dawn, y un banner
 * promocional recibía un corazón). El banco probaba el modelo mental del
 * autor, no el DOM real de un tema. Los casos que faltaban están ahora acá.
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const RAIZ = new URL("../", import.meta.url);
const ruta = (p) => fileURLToPath(new URL(p, RAIZ));

const PUERTO = Number(process.env.PORT || 8787);

const EMBED = "extensions/lovelist-theme/blocks/lovelist-embed.liquid";
const LOCALES = "extensions/lovelist-theme/locales/es.default.json";

/**
 * Arma el bloque `textos` de la config leyendo las MISMAS fuentes que usa la
 * tienda: qué claves expone el embed, y qué dice el catálogo para cada una.
 *
 * Existe porque el banco las tenía copiadas a mano y se desincronizó: la Fase
 * 2.4 sumó nueve textos al embed y el banco se quedó con los doce de la 2.2.
 * Los botones de la página completa se pintaban sin una sola letra y las
 * comprobaciones daban verde igual. Copiar a mano lo que ya vive en otro lado
 * no es un descuido puntual, es una fuente de verdad duplicada; se resuelve
 * leyendo el original, no arreglando la copia.
 */
async function textosDelEmbed() {
  const liquid = await readFile(ruta(EMBED), "utf8");
  const catalogo = JSON.parse(await readFile(ruta(LOCALES), "utf8")).lovelist;

  // Cada línea del embed tiene la forma:  "clave": {{ 'lovelist.clave' | t | json }}
  const claves = [...liquid.matchAll(/"(\w+)":\s*\{\{\s*'lovelist\.(\w+)'\s*\|\s*t/g)];
  if (!claves.length) {
    throw new Error(`no se encontró ningún texto en ${EMBED}. ¿Cambió el formato?`);
  }

  const textos = {};
  const faltan = [];
  for (const [, clave, deCatalogo] of claves) {
    if (!(deCatalogo in catalogo)) faltan.push(deCatalogo);
    else textos[clave] = catalogo[deCatalogo];
  }

  // Si el embed pide una clave que el catálogo no tiene, la tienda mostraría el
  // texto vacío. Es un fallo real: se para acá y no se sirve el banco.
  if (faltan.length) {
    throw new Error(
      `${EMBED} usa claves que no están en ${LOCALES}: ${faltan.join(", ")}`,
    );
  }
  return textos;
}

const TIPOS = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

function aArchivo(url) {
  const p = decodeURIComponent(url.split("?")[0]);
  if (p === "/") return "theme-src/banco-pruebas.html";
  if (p.startsWith("/assets/")) {
    return "extensions/lovelist-theme" + p;
  }
  return null;
}

/**
 * El carrito del tema, para los modos que terminan redirigiendo.
 *
 * Aterrizar acá ES la comprobación: los modos `sin-drawer` y `secciones-nulas`
 * hacen clic en "agregar al carrito" al final de la corrida, y si el respaldo
 * funciona el navegador termina en esta página. Se sirve desde el banco para
 * que el resultado se vea sin tener que mirar la barra de direcciones.
 */
const PAGINA_CARRITO = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>Carrito del tema</title></head>
<body style="font-family: system-ui, sans-serif; margin: 1rem">
<pre id="resultados" style="background:#111;color:#0f0;padding:12px;white-space:pre-wrap;font-family:monospace">=== RESPALDO SIN PANEL DEL TEMA ===
PASS  agregar al carrito redirigio a /cart

TODO OK</pre>
<p>Este es el carrito del tema simulado. Llegar acá es lo que se estaba probando.</p>
</body></html>`;

createServer(async (req, res) => {
  if (req.url.split("?")[0] === "/cart") {
    res.writeHead(200, {
      "Content-Type": TIPOS[".html"],
      "Cache-Control": "no-store",
    });
    res.end(PAGINA_CARRITO);
    return;
  }

  const destino = aArchivo(req.url);
  if (!destino) {
    res.writeHead(404);
    res.end("no");
    return;
  }
  try {
    const ext = destino.slice(destino.lastIndexOf("."));
    let cuerpo = await readFile(ruta(destino));

    if (ext === ".html") {
      const textos = JSON.stringify(await textosDelEmbed());
      cuerpo = String(cuerpo).replace("__TEXTOS__", textos);
    }

    res.writeHead(200, {
      "Content-Type": TIPOS[ext] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(cuerpo);
  } catch (e) {
    // Un texto que falta es un fallo del proyecto, no un 404: hay que verlo.
    if (e && e.code !== "ENOENT") {
      res.writeHead(500);
      res.end(String(e.message));
      return;
    }
    res.writeHead(404);
    res.end(`no se encontro ${destino}. Corriste "npm run build:theme"?`);
  }
}).listen(PUERTO, () => {
  console.log(`Banco de pruebas en http://localhost:${PUERTO}`);
  console.log("  primera visita : http://localhost:%d/", PUERTO);
  console.log("  sin estado     : http://localhost:%d/?sin-estado", PUERTO);
});

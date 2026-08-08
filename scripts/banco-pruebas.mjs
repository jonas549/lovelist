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

createServer(async (req, res) => {
  const destino = aArchivo(req.url);
  if (!destino) {
    res.writeHead(404);
    res.end("no");
    return;
  }
  try {
    const cuerpo = await readFile(ruta(destino));
    const ext = destino.slice(destino.lastIndexOf("."));
    res.writeHead(200, {
      "Content-Type": TIPOS[ext] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(cuerpo);
  } catch {
    res.writeHead(404);
    res.end(`no se encontro ${destino}. Corriste "npm run build:theme"?`);
  }
}).listen(PUERTO, () => {
  console.log(`Banco de pruebas en http://localhost:${PUERTO}`);
  console.log("  primera visita : http://localhost:%d/", PUERTO);
  console.log("  sin estado     : http://localhost:%d/?sin-estado", PUERTO);
});

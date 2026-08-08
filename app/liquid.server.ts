/**
 * Respuestas Liquid para las páginas que sirve el App Proxy.
 *
 * Cuando el proxy devuelve `Content-Type: application/liquid`, Shopify toma el
 * cuerpo, lo pasa por Liquid y lo mete dentro del layout del tema. Por eso la
 * página hereda header, footer y tipografías sin que tengamos que replicarlas.
 */

/** Content-Type que le pide a Shopify envolver la respuesta en el tema. */
const TIPO_LIQUID = "application/liquid";

export function escaparHtml(valor: unknown): string {
  return String(valor == null ? "" : valor)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Escapado para texto de usuario dentro de una respuesta Liquid.
 *
 * Además del escapado HTML hay que neutralizar la llave de apertura: el cuerpo
 * que devolvemos lo evalúa el motor de Liquid de Shopify ANTES de llegar al
 * navegador, así que un nombre de lista como `{{ shop.email }}` se ejecutaría.
 * Reemplazar `{` por su entidad hace que Liquid nunca vea `{{` ni `{%`, y el
 * navegador la decodifica después, así que en pantalla se lee igual.
 */
export function escaparLiquid(valor: unknown): string {
  return escaparHtml(valor).replace(/\{/g, "&#123;");
}

export function respuestaLiquid(
  cuerpo: string,
  opciones: { status?: number; noindex?: boolean } = {},
): Response {
  const cabeceras: Record<string, string> = {
    "Content-Type": TIPO_LIQUID,
    "Cache-Control": "no-store",
  };
  if (opciones.noindex) {
    cabeceras["X-Robots-Tag"] = "noindex, nofollow";
  }
  return new Response(cuerpo, { status: opciones.status ?? 200, headers: cabeceras });
}

/**
 * Mete un <meta name="robots"> en el <head> del tema.
 *
 * Sirve de refuerzo de la cabecera X-Robots-Tag: el cuerpo que devolvemos se
 * inserta en medio del <body> del tema, y ahí una etiqueta meta no cuenta, así
 * que hay que moverla. No es elegante, pero una lista de deseos indexada en
 * Google es un problema de privacidad.
 */
export const SCRIPT_NOINDEX =
  '<script>document.head.appendChild(Object.assign(' +
  'document.createElement("meta"),{name:"robots",content:"noindex,nofollow"}));</script>';

import crypto from "node:crypto";

/**
 * Tolerancia de reloj para el parámetro `timestamp`, en segundos.
 * Mismo valor que usa @shopify/shopify-api internamente. Evita replays.
 */
const TOLERANCIA_TIMESTAMP_SEG = 90;

export type MotivoRechazo =
  | "sin_firma"
  | "firma_invalida"
  | "timestamp_fuera_de_rango";

export type ResultadoProxy =
  | { valido: true; shop: string; loggedInCustomerId: string | null }
  | { valido: false; motivo: MotivoRechazo };

/**
 * Validación de la firma del App Proxy de Shopify.
 *
 * Shopify agrega a la query string un parámetro `signature`. Para verificarlo:
 *   1. Sacar `signature` de los parámetros.
 *   2. Armar "clave=valor" para cada uno; si una clave se repite, unir sus
 *      valores con coma.
 *   3. Ordenar alfabéticamente por clave.
 *   4. Concatenar esas cadenas SIN separador.
 *   5. HMAC-SHA256 con el client secret de la app, en hex.
 *   6. Comparar en tiempo constante contra `signature`.
 *
 * Ojo: NO es lo mismo que la firma de los webhooks (base64 sobre el body) ni la
 * del OAuth (`hmac`, con `&` como separador).
 *
 * Doc: https://shopify.dev/docs/apps/build/online-store/display-dynamic-data
 */
export function verificarFirmaProxy(
  url: URL,
  secret = process.env.SHOPIFY_API_SECRET ?? "",
): ResultadoProxy {
  const signature = url.searchParams.get("signature");
  if (!signature || !secret) {
    return { valido: false, motivo: "sin_firma" };
  }

  const timestamp = Number(url.searchParams.get("timestamp"));
  const ahora = Math.trunc(Date.now() / 1000);
  if (
    !Number.isFinite(timestamp) ||
    Math.abs(ahora - timestamp) > TOLERANCIA_TIMESTAMP_SEG
  ) {
    return { valido: false, motivo: "timestamp_fuera_de_rango" };
  }

  const porClave = new Map<string, string[]>();
  for (const [clave, valor] of url.searchParams.entries()) {
    if (clave === "signature") continue;
    const existentes = porClave.get(clave);
    if (existentes) {
      existentes.push(valor);
    } else {
      porClave.set(clave, [valor]);
    }
  }

  const mensaje = [...porClave.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([clave, valores]) => `${clave}=${valores.join(",")}`)
    .join("");

  const esperado = crypto
    .createHmac("sha256", secret)
    .update(mensaje, "utf8")
    .digest("hex");

  const a = Buffer.from(esperado, "utf8");
  const b = Buffer.from(signature, "utf8");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { valido: false, motivo: "firma_invalida" };
  }

  const loggedInCustomerId = url.searchParams.get("logged_in_customer_id");

  return {
    valido: true,
    shop: url.searchParams.get("shop") ?? "",
    loggedInCustomerId: loggedInCustomerId || null,
  };
}

/**
 * Valida la firma y devuelve el contexto del proxy.
 * Lanza una Response 401 (JSON) si no valida.
 *
 * `logged_in_customer_id` lo inyecta Shopify cuando hay un cliente con sesión
 * iniciada en el storefront; va vacío si el visitante es anónimo. Por eso NO
 * necesitamos el scope read_customers para identificar al cliente.
 */
export function authenticateProxy(request: Request): {
  shop: string;
  loggedInCustomerId: string | null;
} {
  const resultado = verificarFirmaProxy(new URL(request.url));

  if (!resultado.valido) {
    throw new Response(
      JSON.stringify({ ok: false, error: resultado.motivo }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  const { shop, loggedInCustomerId } = resultado;
  return { shop, loggedInCustomerId };
}

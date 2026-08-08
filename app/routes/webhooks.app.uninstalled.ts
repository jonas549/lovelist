import type { ActionFunctionArgs } from "react-router";

import { authenticate } from "../shopify.server";
import { marcarDesinstalada } from "../privacidad.server";

/**
 * app/uninstalled — limpia las sesiones y marca la tienda como desinstalada.
 *
 * Las wishlists NO se borran acá: si el merchant reinstala, los compradores
 * recuperan lo suyo. El borrado definitivo lo pide shop/redact.
 *
 * Shopify puede reenviar este webhook, así que la operación es idempotente.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);

  try {
    const r = await marcarDesinstalada(shop);
    console.log(
      `[${topic}] ${shop}: ${r.sesiones} sesiones borradas, ` +
        `tienda ${r.tiendaMarcada ? "marcada" : "sin fila en Shop"}`,
    );
  } catch (e) {
    console.error(`[${topic}] fallo limpiando ${shop}`, e);
    return new Response("Error procesando la desinstalación", { status: 500 });
  }

  return new Response();
};

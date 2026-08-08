import type { ActionFunctionArgs } from "react-router";

import { authenticate } from "../shopify.server";

/**
 * Webhooks obligatorios de privacidad (GDPR/CCPA):
 *   customers/data_request, customers/redact, shop/redact
 *
 * `authenticate.webhook` valida la firma HMAC y devuelve 401 si no cuadra.
 * Por ahora solo dejamos constancia: Lovelist todavía no guarda datos de
 * clientes. Cuando existan wishlists habrá que exportar/borrar acá.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);

  console.log(`Webhook de privacidad ${topic} recibido para ${shop}`);

  switch (topic) {
    case "CUSTOMERS_DATA_REQUEST":
      // TODO: exportar las wishlists del cliente cuando existan.
      break;
    case "CUSTOMERS_REDACT":
      // TODO: borrar las wishlists del cliente cuando existan.
      break;
    case "SHOP_REDACT":
      // TODO: borrar todos los datos de la tienda cuando existan.
      break;
  }

  return new Response();
};

import type { ActionFunctionArgs } from "react-router";

import { authenticate } from "../shopify.server";
import {
  borrarDatosDeCliente,
  borrarDatosDeTienda,
  exportarDatosDeCliente,
} from "../privacidad.server";

type PayloadPrivacidad = {
  shop_domain?: string;
  customer?: { id?: number | string };
};

/**
 * Webhooks obligatorios de privacidad (GDPR/CCPA):
 *   customers/data_request, customers/redact, shop/redact
 *
 * `authenticate.webhook` valida la firma HMAC y devuelve 401 si no cuadra.
 *
 * Si el borrado falla devolvemos 500 a propósito, para que Shopify reintente.
 * Un 200 con el borrado a medias sería decir que cumplimos sin haberlo hecho.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);
  const datos = (payload ?? {}) as PayloadPrivacidad;

  try {
    switch (topic) {
      case "CUSTOMERS_REDACT": {
        const r = await borrarDatosDeCliente(shop, datos.customer?.id);
        console.log(
          `[privacidad] customers/redact ${shop}: ${r.listas} listas, ${r.items} items borrados`,
        );
        break;
      }

      case "SHOP_REDACT": {
        const r = await borrarDatosDeTienda(shop);
        console.log(
          `[privacidad] shop/redact ${shop}: ${r.listas} listas, ${r.items} items, ${r.sesiones} sesiones borradas`,
        );
        break;
      }

      case "CUSTOMERS_DATA_REQUEST": {
        const r = await exportarDatosDeCliente(shop, datos.customer?.id);
        const productos = r.listas.reduce((t, l) => t + l.productos.length, 0);
        console.log(
          `[privacidad] customers/data_request ${shop} cliente ${r.customerId}: ` +
            `${r.listas.length} listas, ${productos} productos`,
          JSON.stringify(r),
        );
        break;
      }

      default:
        console.warn(`[privacidad] topic inesperado en /webhooks/app/gdpr: ${topic}`);
    }
  } catch (e) {
    // Nada de tragarse el error: si no pudimos cumplir, que Shopify reintente.
    console.error(`[privacidad] fallo procesando ${topic} para ${shop}`, e);
    return new Response("Error procesando la solicitud de privacidad", {
      status: 500,
    });
  }

  return new Response();
};

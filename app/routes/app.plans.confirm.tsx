import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { authenticate } from "../shopify.server";
import {
  LIMITE_ITEMS_FREE,
  LIMITE_ITEMS_PRO,
  estadoDeConfirmacion,
  sincronizarPlanDeTienda,
} from "../plan.server";
import { t, ti } from "../i18n";

/**
 * Vuelta desde la página de precios de Shopify.
 *
 * Shopify agrega `?plan_handle=` a la URL de retorno. **Ese parámetro es una
 * pista, no una prueba**: viene en la URL y cualquiera puede escribirlo. Acá
 * no se lee para decidir nada.
 *
 * Lo único que decide es lo que responde Shopify cuando le preguntamos por la
 * suscripción. Escribir el plan desde el parámetro sería dejar que cualquier
 * merchant autenticado se suba de plan visitando una dirección a mano.
 *
 * Se sincroniza siempre, sin TTL: el merchant acaba de suscribirse y esperar
 * cinco minutos para reflejarlo sería absurdo.
 *
 * Los dos planes comparten esta URL de retorno, así que acá también aterriza
 * quien **elige Gratis**. Ese caso no es un fallo de confirmación y no puede
 * mostrar el mensaje de "todavía no vemos tu suscripción": la vimos, y es la
 * que pidió. Por eso se mira la lectura y no solo el plan resultante.
 *
 * `sincronizarPlanDeTienda` asegura la fila de la tienda: esta pantalla **no
 * puede** volver a depender de que exista. Antes lo hacía, y en una tienda
 * recién instalada —la del revisor— eso significaba decirle "no vemos tu
 * suscripción" a alguien que acababa de pagar, sin salida posible.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const { shop, lectura } = await sincronizarPlanDeTienda(session.shop);
  const estado = estadoDeConfirmacion(shop, lectura);

  // El único caso que queda sin confirmar es que Shopify no haya contestado, y
  // es el que hay que poder rastrear después: acá el merchant ya pagó.
  if (estado === "sinConfirmar") {
    console.error(
      `[Lovelist] ${session.shop} volvió de la página de precios y no se pudo confirmar el plan:`,
      lectura.estado === "desconocido" ? lectura.motivo : `handle "${lectura.handle}"`,
    );
  }

  return {
    estado,
    limiteFree: LIMITE_ITEMS_FREE,
    limitePro: LIMITE_ITEMS_PRO,
  };
};

export default function ConfirmarPlan() {
  const { estado, limiteFree, limitePro } = useLoaderData<typeof loader>();

  return (
    <s-page heading={t("planes.titulo")}>
      {estado === "pro" ? (
        <s-section heading={t("planes.confirmadoTitulo")}>
          <s-paragraph>
            {ti("planes.confirmadoTexto", { pro: limitePro })}
          </s-paragraph>
          <s-button href="/app" variant="primary">
            {t("planes.confirmadoIr")}
          </s-button>
        </s-section>
      ) : estado === "gratis" ? (
        <s-section heading={t("planes.gratisTitulo")}>
          <s-paragraph>
            {ti("planes.gratisTexto", { free: limiteFree })}
          </s-paragraph>
          <s-button href="/app" variant="primary">
            {t("planes.confirmadoIr")}
          </s-button>
          <s-button href="/app/plans" variant="secondary">
            {t("planes.gratisSubir")}
          </s-button>
        </s-section>
      ) : (
        <s-section heading={t("planes.noConfirmadoTitulo")}>
          <s-paragraph>{t("planes.noConfirmadoTexto")}</s-paragraph>
          <s-button href="/app/plans/confirm" variant="primary">
            {t("planes.reintentar")}
          </s-button>
        </s-section>
      )}
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

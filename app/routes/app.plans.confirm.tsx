import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { authenticate } from "../shopify.server";
import { buscarShop } from "../proxy.server";
import {
  LIMITE_ITEMS_FREE,
  LIMITE_ITEMS_PRO,
  estadoDeConfirmacion,
  sincronizarPlanConLectura,
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
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const shop = await buscarShop(session.shop);
  const sincronizado = shop ? await sincronizarPlanConLectura(shop) : null;

  return {
    estado: sincronizado
      ? estadoDeConfirmacion(sincronizado.shop, sincronizado.lectura)
      : ("sinConfirmar" as const),
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

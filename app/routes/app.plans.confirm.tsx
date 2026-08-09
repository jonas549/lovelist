import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { authenticate } from "../shopify.server";
import { buscarShop } from "../proxy.server";
import { sincronizarPlan, tienePlanActivo } from "../plan.server";
import { t } from "../i18n";

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
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const shop = await buscarShop(session.shop);
  const alDia = shop ? await sincronizarPlan(shop) : null;

  return { activo: tienePlanActivo(alDia) };
};

export default function ConfirmarPlan() {
  const { activo } = useLoaderData<typeof loader>();

  return (
    <s-page heading={t("planes.titulo")}>
      {activo ? (
        <s-section heading={t("planes.confirmadoTitulo")}>
          <s-paragraph>{t("planes.confirmadoTexto")}</s-paragraph>
          <s-button href="/app" variant="primary">
            {t("planes.confirmadoIr")}
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

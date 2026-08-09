import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";

import { authenticate } from "../shopify.server";
import { buscarShop, confirmarInstalada } from "../proxy.server";
import { sincronizarPlanSiHaceFalta } from "../plan.server";
import { t, ti } from "../i18n";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  // La app está instalada: si quedaba una marca de desinstalación vieja, era
  // mentira. Se limpia acá porque es el único lugar donde lo sabemos con
  // certeza.
  await confirmarInstalada(session.shop);

  // **Acá NO hay paywall.** Hubo uno —sin suscripción, el admin entero
  // redirigía a la pantalla de planes— y se sacó: una app pública no puede
  // secuestrarse a sí misma detrás de un muro. El revisor de Shopify instala y
  // prueba todo sin suscribirse, y el merchant prueba antes de pagar.
  //
  // El plan se sigue sondeando —con su ventana de cinco minutos— porque el
  // dashboard lo necesita para avisar cuando el límite del gratuito estorba,
  // pero no decide si se entra o no.
  const shop = await buscarShop(session.shop);
  if (shop) await sincronizarPlanSiHaceFalta(shop);

  // eslint-disable-next-line no-undef
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();

  return (
    <AppProvider embedded apiKey={apiKey}>
      {/* La navegación la pinta el admin en su barra lateral, no nosotros.
          `rel="home"` marca cuál es la pantalla de entrada. */}
      <s-app-nav>
        <a href="/app" rel="home">
          {t("nav.inicio")}
        </a>
        <a href="/app/settings">{t("nav.configuracion")}</a>
        {/* El merchant tiene que poder subir y bajar de plan sin escribirle a
            soporte ni reinstalar la app: lo pide Shopify explícitamente. */}
        <a href="/app/plans">{t("nav.plan")}</a>
        <a href="/app/support">{t("nav.soporte")}</a>
      </s-app-nav>

      <Outlet />

      {/* Pie de ayuda en todas las páginas: Shopify lo pide explícitamente
          para las apps públicas, y enlaza a una pantalla propia y no a una
          landing. */}
      <s-box padding="base">
        <s-text color="subdued">
          {ti("nav.ayudaPie", { correo: t("soporte.correo") })}
        </s-text>
      </s-box>
    </AppProvider>
  );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

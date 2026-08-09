import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, redirect, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";

import { authenticate } from "../shopify.server";
import { buscarShop } from "../proxy.server";
import { sincronizarPlanSiHaceFalta, tienePlanActivo } from "../plan.server";
import { t, ti } from "../i18n";

/**
 * Pantallas que se ven SIN suscripción activa.
 *
 * Soporte entra a propósito: un merchant con un problema de cobro tiene que
 * poder escribirnos, y encerrarlo detrás del mismo paywall que no puede pagar
 * sería la peor experiencia posible.
 */
const SIN_PLAN = ["/app/plans", "/app/support"];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const ruta = new URL(request.url).pathname;
  const libre = SIN_PLAN.some((p) => ruta === p || ruta.startsWith(`${p}/`));

  if (!libre) {
    const shop = await buscarShop(session.shop);
    const alDia = shop ? await sincronizarPlanSiHaceFalta(shop) : null;
    if (!tienePlanActivo(alDia)) throw redirect("/app/plans");
  }

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

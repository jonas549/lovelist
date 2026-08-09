import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";

import { authenticate } from "../shopify.server";
import { t, ti } from "../i18n";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

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

import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { authenticate } from "../shopify.server";
import { t } from "../i18n";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  return { shop: session.shop };
};

export default function Index() {
  const { shop } = useLoaderData<typeof loader>();

  return (
    <s-page heading={t("app.titulo")}>
      <s-section heading={t("app.tiendaConectada")}>
        <s-paragraph>{shop}</s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

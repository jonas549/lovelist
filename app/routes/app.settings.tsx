import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { authenticate } from "../shopify.server";
import { enlacesDelEditor } from "../onboarding.server";
import { t } from "../i18n";

/**
 * Configuración.
 *
 * La apariencia y los textos NO viven acá: viven en los settings del app embed,
 * dentro del tema. Se decidió así porque el storefront los necesita para
 * pintarse y de ese modo llegan con la página, sin una petición de red que
 * haría parpadear el ícono en cada carga.
 *
 * Esta pantalla explica qué se puede configurar y lleva al lugar donde se hace.
 * No muestra los valores actuales del merchant, y no es un olvido: leerlos
 * pediría el scope `read_themes` y decidimos no sumar un permiso a la pantalla
 * de instalación por una comodidad nuestra. A cambio, el editor de temas le
 * muestra sus valores reales sobre su propia tienda y con vista previa, que es
 * mejor que un espejo nuestro.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  return {
    enlaces: enlacesDelEditor(
      session.shop,
      // eslint-disable-next-line no-undef
      process.env.SHOPIFY_API_KEY || "",
    ),
  };
};

function Punto({ children }: { children: string }) {
  return (
    <li style={{ marginBottom: "0.35rem" }}>
      <s-text>{children}</s-text>
    </li>
  );
}

export default function Configuracion() {
  const { enlaces } = useLoaderData<typeof loader>();

  return (
    <s-page heading={t("ajustes.titulo")}>
      {/* El boton de volver de una subpagina lo pinta el admin: se le
          pasa un enlace en el slot que Shopify define para eso. */}
      <s-link slot="breadcrumb-actions" href="/app">
        {t("nav.volver")}
      </s-link>

      <s-section>
        <s-paragraph>{t("ajustes.intro")}</s-paragraph>
        <s-button href={enlaces.embed} target="_blank" variant="primary">
          {t("ajustes.abrirEditor")}
        </s-button>
      </s-section>

      <s-section heading={t("ajustes.donde")}>
        <s-paragraph>{t("ajustes.dondeAyuda")}</s-paragraph>
      </s-section>

      <s-section heading={t("ajustes.queSePuede")}>
        <s-heading>{t("ajustes.apariencia")}</s-heading>
        <ul style={{ margin: "0.5rem 0 1.25rem", paddingLeft: "1.25rem" }}>
          <Punto>{t("ajustes.aparienciaIcono")}</Punto>
          <Punto>{t("ajustes.aparienciaColores")}</Punto>
          <Punto>{t("ajustes.aparienciaContador")}</Punto>
          <Punto>{t("ajustes.aparienciaBotones")}</Punto>
        </ul>

        <s-heading>{t("ajustes.textos")}</s-heading>
        <ul style={{ margin: "0.5rem 0 1.25rem", paddingLeft: "1.25rem" }}>
          <Punto>{t("ajustes.textosBoton")}</Punto>
          <Punto>{t("ajustes.textosPagina")}</Punto>
          <Punto>{t("ajustes.textosCompartir")}</Punto>
        </ul>

        <s-heading>{t("ajustes.botonProducto")}</s-heading>
        <s-paragraph>{t("ajustes.botonProductoAyuda")}</s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { authenticate } from "../shopify.server";
import { t } from "../i18n";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

/**
 * Soporte.
 *
 * Shopify pide instrucciones específicas para Shopify —no genéricas— y que las
 * páginas de ayuda sean propias y no una landing de marketing. Por eso las
 * respuestas dicen dónde tocar en el editor de temas, y no "consultá nuestra
 * documentación".
 */
function Pregunta({ pregunta, respuesta }: { pregunta: string; respuesta: string }) {
  return (
    <div style={{ marginBottom: "1.25rem" }}>
      <s-heading>{pregunta}</s-heading>
      <s-paragraph>{respuesta}</s-paragraph>
    </div>
  );
}

export default function Soporte() {
  const correo = t("soporte.correo");

  return (
    <s-page heading={t("soporte.titulo")}>
      {/* El boton de volver de una subpagina lo pinta el admin: se le
          pasa un enlace en el slot que Shopify define para eso. */}
      <s-link slot="breadcrumb-actions" href="/app">
        {t("nav.volver")}
      </s-link>

      <s-section>
        <s-paragraph>{t("soporte.intro")}</s-paragraph>
        <s-paragraph>
          <s-text color="subdued">{t("soporte.respuesta")}</s-text>
        </s-paragraph>
        <s-button href={`mailto:${correo}`} variant="primary">
          {t("soporte.escribir")}
        </s-button>
      </s-section>

      <s-section heading={t("soporte.preguntas")}>
        <Pregunta
          pregunta={t("soporte.pInstalar")}
          respuesta={t("soporte.rInstalar")}
        />
        <Pregunta pregunta={t("soporte.pIcono")} respuesta={t("soporte.rIcono")} />
        <Pregunta pregunta={t("soporte.pTextos")} respuesta={t("soporte.rTextos")} />
        <Pregunta
          pregunta={t("soporte.pInvitados")}
          respuesta={t("soporte.rInvitados")}
        />
        <Pregunta
          pregunta={t("soporte.pCompartir")}
          respuesta={t("soporte.rCompartir")}
        />
        <Pregunta pregunta={t("soporte.pDatos")} respuesta={t("soporte.rDatos")} />
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

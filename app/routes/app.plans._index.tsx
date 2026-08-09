import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { authenticate } from "../shopify.server";
import { buscarShop } from "../proxy.server";
import {
  LIMITE_ITEMS_FREE,
  LIMITE_ITEMS_PRO,
  sincronizarPlan,
  tienePlanActivo,
  urlDePlanes,
} from "../plan.server";
import { t, ti } from "../i18n";

/**
 * Pantalla de planes. **Informativa, no un muro.**
 *
 * La app funciona entera sin pagar: lo único que cambia entre planes es
 * cuántos favoritos entran por lista. Nadie llega acá redirigido.
 *
 * Se sondea sin ventana de espera a propósito: el merchant está mirando una
 * decisión de dinero y no puede ver un plan viejo. Es el mismo criterio que
 * usa DiscountFlow en su pantalla de planes.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const shop = await buscarShop(session.shop);
  const alDia = shop ? await sincronizarPlan(shop) : null;

  return {
    pro: tienePlanActivo(alDia),
    url: urlDePlanes(session.shop),
    limiteFree: LIMITE_ITEMS_FREE,
    limitePro: LIMITE_ITEMS_PRO,
    correo: t("soporte.correo"),
  };
};

function Incluye({ children }: { children: string }) {
  return (
    <li style={{ marginBottom: "0.35rem" }}>
      <s-text>{children}</s-text>
    </li>
  );
}

function Plan({
  titulo,
  precio,
  limite,
  actual,
  children,
}: {
  titulo: string;
  precio: string;
  limite: string;
  actual: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div
      style={{
        flex: "1 1 16rem",
        minWidth: 0,
        border: "1px solid rgba(128,128,128,0.3)",
        borderRadius: "8px",
        padding: "1rem",
      }}
    >
      <s-stack direction="inline" gap="base" alignItems="center">
        <s-heading>{titulo}</s-heading>
        {actual ? <s-badge tone="success">{t("planes.tuPlan")}</s-badge> : null}
      </s-stack>
      <div style={{ fontSize: "1.5rem", fontWeight: 600, margin: "0.5rem 0" }}>
        {precio}
      </div>
      <s-paragraph>{limite}</s-paragraph>
      {children}
    </div>
  );
}

export default function Planes() {
  const { pro, url, limiteFree, limitePro, correo } = useLoaderData<typeof loader>();

  return (
    <s-page heading={t("planes.titulo")}>
      <s-link slot="breadcrumb-actions" href="/app">
        {t("nav.volver")}
      </s-link>

      <s-section>
        <s-paragraph>{t("planes.intro")}</s-paragraph>

        <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem", marginTop: "1rem" }}>
          <Plan
            titulo={t("planes.freeTitulo")}
            precio={t("planes.freePrecio")}
            limite={ti("planes.freeLimite", { n: limiteFree })}
            actual={!pro}
          />

          <Plan
            titulo={t("planes.proTitulo")}
            precio={t("planes.proPrecio")}
            limite={ti("planes.proLimite", { n: limitePro })}
            actual={pro}
          >
            <s-paragraph>
              <s-text color="subdued">{t("planes.proAyuda")}</s-text>
            </s-paragraph>

            {/* Sin el handle de la app no se puede armar la URL de precios de
                Shopify. Botón deshabilitado y nota discreta: nunca un cartel
                de error, que se lee como app rota. */}
            {url ? (
              <s-button href={url} target="_blank" variant={pro ? "secondary" : "primary"}>
                {pro ? t("planes.gestionar") : t("planes.subir")}
              </s-button>
            ) : (
              <>
                <s-button variant="primary" disabled>
                  {t("planes.subir")}
                </s-button>
                <s-paragraph>
                  <s-text color="subdued">
                    {ti("planes.faltaHandle", { correo })}
                  </s-text>
                </s-paragraph>
              </>
            )}
          </Plan>
        </div>

        {/* Shopify exige que el merchant pueda cambiar de plan o cancelar sin
            escribirle a soporte ni reinstalar la app. */}
        <s-paragraph>
          <s-text color="subdued">{t("planes.gestionarAyuda")}</s-text>
        </s-paragraph>
      </s-section>

      <s-section heading={t("planes.enLosDos")}>
        <ul style={{ margin: "0.5rem 0", paddingLeft: "1.25rem" }}>
          <Incluye>{t("planes.inc1")}</Incluye>
          <Incluye>{t("planes.inc2")}</Incluye>
          <Incluye>{t("planes.inc3")}</Incluye>
          <Incluye>{t("planes.inc4")}</Incluye>
          <Incluye>{t("planes.inc5")}</Incluye>
        </ul>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

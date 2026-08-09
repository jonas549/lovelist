import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { authenticate } from "../shopify.server";
import { buscarShop } from "../proxy.server";
import {
  sincronizarPlanSiHaceFalta,
  tienePlanActivo,
  urlDePlanes,
} from "../plan.server";
import { t, ti } from "../i18n";

/**
 * Pantalla de planes.
 *
 * La app no crea la suscripción ni cobra: manda a la página de precios que
 * hospeda Shopify. Ahí el merchant elige, Shopify cobra junto con su factura,
 * y vuelve a /app/plans/confirm.
 *
 * Esta pantalla es también la que ve un merchant sin plan cuando entra a
 * cualquier otra parte del admin.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const shop = await buscarShop(session.shop);
  const alDia = shop ? await sincronizarPlanSiHaceFalta(shop) : null;

  return {
    activo: tienePlanActivo(alDia),
    // Distingue "nunca tuvo plan" de "lo tuvo y se dio de baja": el mensaje
    // que tranquiliza sobre los datos guardados solo tiene sentido en el
    // segundo caso.
    tuvoPlan: Boolean(alDia?.planActivatedAt) && !tienePlanActivo(alDia),
    url: urlDePlanes(session.shop),
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

export default function Planes() {
  const { activo, tuvoPlan, url, correo } = useLoaderData<typeof loader>();

  return (
    <s-page heading={t("planes.titulo")}>
      {activo ? (
        <s-section heading={t("planes.activoTitulo")}>
          <s-paragraph>{t("planes.activoTexto")}</s-paragraph>
          {url ? (
            <s-button href={url} target="_blank" variant="secondary">
              {t("planes.gestionar")}
            </s-button>
          ) : null}
        </s-section>
      ) : (
        <>
          {tuvoPlan ? (
            <s-section heading={t("planes.sinPlanTitulo")}>
              <s-paragraph>{t("planes.sinPlanTexto")}</s-paragraph>
            </s-section>
          ) : null}

          <s-section heading={t("planes.heroTitulo")}>
            <s-paragraph>{t("planes.heroTexto")}</s-paragraph>

            <div style={{ fontSize: "1.75rem", fontWeight: 600, margin: "0.75rem 0 0.25rem" }}>
              {t("planes.precio")}
            </div>
            <s-paragraph>
              <s-text color="subdued">{t("planes.precioAyuda")}</s-text>
            </s-paragraph>

            {/* Sin el handle de la app no se puede armar la URL de precios de
                Shopify. La pantalla se ve igual —precio, qué incluye, botón— y
                el botón queda deshabilitado con una nota discreta debajo.
                Nunca un cartel de error: esto es lo primero que ve un revisor
                de Shopify, y una pantalla en rojo se lee como app rota. */}
            {url ? (
              <s-button href={url} target="_blank" variant="primary">
                {t("planes.elegir")}
              </s-button>
            ) : (
              <>
                <s-button variant="primary" disabled>
                  {t("planes.elegir")}
                </s-button>
                <s-paragraph>
                  <s-text color="subdued">
                    {ti("planes.faltaHandle", { correo })}
                  </s-text>
                </s-paragraph>
              </>
            )}
          </s-section>
        </>
      )}

      <s-section heading={t("planes.queIncluye")}>
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

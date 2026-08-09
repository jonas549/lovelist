import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher, useLoaderData, useRevalidator } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { authenticate } from "../shopify.server";
import { buscarShop } from "../proxy.server";
import { kpis, masDeseados, type Kpis } from "../metricas.server";
import {
  confirmarBotonProducto,
  enlacesDelEditor,
  estadoPrimerosPasos,
  type EstadoPrimerosPasos,
} from "../onboarding.server";
import { resolverProductos } from "../productos.server";
import { t, ti } from "../i18n";

type Deseado = {
  productId: string;
  guardados: number;
  title: string;
  imagen: string | null;
  precio: string;
  moneda: string;
  url: string;
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const shop = await buscarShop(session.shop);
  const enlaces = enlacesDelEditor(
    session.shop,
    // eslint-disable-next-line no-undef
    process.env.SHOPIFY_API_KEY || "",
  );
  const pasos = estadoPrimerosPasos(shop);

  // Sin fila de tienda todavía no hay nada que contar: nadie guardó nunca.
  if (!shop) {
    return {
      shop: session.shop,
      pasos,
      enlaces,
      numeros: {
        listas: 0,
        favoritos: 0,
        favoritosUltimos30: 0,
        agregadosAlCarrito: 0,
        agregadosAlCarritoUltimos30: 0,
      } satisfies Kpis,
      deseados: [] as Deseado[],
    };
  }

  const [numeros, top] = await Promise.all([
    kpis(shop.id),
    masDeseados(shop.id, 10),
  ]);

  // Los datos de producto no se guardan: se leen de Shopify al mostrar. Si la
  // Admin API falla, el dashboard sigue en pie con los números, que son lo que
  // de verdad importa. Una tarjeta sin foto es mejor que una pantalla en
  // blanco.
  let resueltos = new Map<string, Awaited<ReturnType<typeof resolverProductos>> extends Map<string, infer V> ? V : never>();
  try {
    resueltos = await resolverProductos(
      session.shop,
      top.map((p) => ({ productId: p.productId, variantId: null })),
    );
  } catch {
    /* se muestran los conteos sin los datos del producto */
  }

  const deseados: Deseado[] = top.map((p) => {
    const datos = resueltos.get(`${p.productId}|`);
    return {
      productId: p.productId,
      guardados: p.guardados,
      title: datos?.title ?? t("metricas.productoNoDisponible"),
      imagen: datos?.imagen ?? null,
      precio: datos?.precio ?? "",
      moneda: datos?.moneda ?? "",
      url: datos?.url ?? "",
    };
  });

  return { shop: session.shop, pasos, enlaces, numeros, deseados };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await buscarShop(session.shop);
  if (!shop) return { ok: false };

  const datos = await request.formData();
  await confirmarBotonProducto(shop.id, datos.get("confirmado") === "si");
  return { ok: true };
};

function precioLegible(precio: string, moneda: string): string {
  const n = Number(precio);
  if (!isFinite(n)) return "";
  try {
    return new Intl.NumberFormat("es", {
      style: "currency",
      currency: moneda || "USD",
    }).format(n);
  } catch {
    return `${n.toFixed(2)} ${moneda}`.trim();
  }
}

function cuandoLegible(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Intl.DateTimeFormat("es", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function Kpi({ etiqueta, valor, nota }: { etiqueta: string; valor: number; nota?: string }) {
  return (
    <div style={{ minWidth: "12rem", flex: "1 1 12rem" }}>
      <s-text color="subdued">{etiqueta}</s-text>
      <div style={{ fontSize: "2rem", fontWeight: 600, lineHeight: 1.2 }}>
        {new Intl.NumberFormat("es").format(valor)}
      </div>
      {nota ? <s-text color="subdued">{nota}</s-text> : null}
    </div>
  );
}

function PrimerosPasos({
  pasos,
  enlaces,
}: {
  pasos: EstadoPrimerosPasos;
  enlaces: { embed: string; boton: string };
}) {
  const fetcher = useFetcher<typeof action>();
  const revalidator = useRevalidator();
  const guardando = fetcher.state !== "idle";

  // Mientras viaja la petición se muestra lo que el merchant acaba de elegir,
  // no lo que dice el servidor: si no, la casilla se destilda sola y parece
  // que no se guardó.
  const confirmado = fetcher.formData
    ? fetcher.formData.get("confirmado") === "si"
    : pasos.botonConfirmado;

  return (
    <s-section heading={t("inicio.titulo")}>
      <s-paragraph>{t("inicio.subtitulo")}</s-paragraph>

      <s-box padding="base">
        <s-stack direction="block" gap="base">
          <s-stack direction="inline" gap="base" alignItems="center">
            <s-badge tone={pasos.embedDetectado ? "success" : "warning"}>
              {pasos.embedDetectado ? t("inicio.listo") : t("inicio.pendiente")}
            </s-badge>
            <s-heading>{t("inicio.embedTitulo")}</s-heading>
          </s-stack>

          <s-paragraph>{t("inicio.embedAyuda")}</s-paragraph>

          <s-paragraph>
            <s-text color="subdued">
              {pasos.embedDetectado
                ? ti("inicio.embedDetectado", {
                    cuando: cuandoLegible(pasos.embedVistoAt),
                  })
                : t("inicio.embedSinDetectar")}
            </s-text>
          </s-paragraph>

          <s-stack direction="inline" gap="base">
            <s-button href={enlaces.embed} target="_blank" variant="primary">
              {t("inicio.embedBoton")}
            </s-button>
            {/* Volver a comprobar es literalmente volver a leer el estado.
                Se revalida en vez de recargar: dentro del admin embebido, una
                recarga completa del iframe se ve como un parpadeo. */}
            <s-button
              variant="secondary"
              disabled={revalidator.state !== "idle" || undefined}
              onClick={() => revalidator.revalidate()}
            >
              {t("inicio.embedComprobar")}
            </s-button>
          </s-stack>
        </s-stack>
      </s-box>

      <s-box padding="base">
        <s-stack direction="block" gap="base">
          <s-stack direction="inline" gap="base" alignItems="center">
            <s-badge tone={confirmado ? "success" : "warning"}>
              {confirmado ? t("inicio.listo") : t("inicio.pendiente")}
            </s-badge>
            <s-heading>{t("inicio.botonTitulo")}</s-heading>
          </s-stack>

          <s-paragraph>{t("inicio.botonAyuda")}</s-paragraph>

          <s-button href={enlaces.boton} target="_blank" variant="secondary">
            {t("inicio.botonBoton")}
          </s-button>

          {/* Una sola casilla que se guarda al tocarla. Sin Contextual Save
              Bar a propósito: esa es para formularios con varios campos, y
              obligar a "guardar" un único tilde es un paso de más. */}
          <s-checkbox
            name="confirmado"
            checked={confirmado || undefined}
            disabled={guardando || undefined}
            label={t("inicio.botonHecho")}
            onChange={(ev: { currentTarget: { checked: boolean } }) => {
              fetcher.submit(
                { confirmado: ev.currentTarget.checked ? "si" : "no" },
                { method: "post" },
              );
            }}
          />
        </s-stack>
      </s-box>

      {pasos.completo ? (
        <s-banner tone="success">{t("inicio.completo")}</s-banner>
      ) : null}
    </s-section>
  );
}

export default function Index() {
  const { pasos, enlaces, numeros, deseados } = useLoaderData<typeof loader>();

  return (
    <s-page heading={t("app.titulo")}>
      <PrimerosPasos pasos={pasos} enlaces={enlaces} />

      <s-section heading={t("metricas.titulo")}>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "1.5rem",
          }}
        >
          <Kpi etiqueta={t("metricas.listas")} valor={numeros.listas} />
          <Kpi
            etiqueta={t("metricas.favoritos")}
            valor={numeros.favoritos}
            nota={ti("metricas.ultimos30", { n: numeros.favoritosUltimos30 })}
          />
          <Kpi
            etiqueta={t("metricas.agregadosAlCarrito")}
            valor={numeros.agregadosAlCarrito}
            nota={ti("metricas.ultimos30", {
              n: numeros.agregadosAlCarritoUltimos30,
            })}
          />
        </div>

        <s-paragraph>
          <s-text color="subdued">{t("metricas.agregadosAlCarritoAyuda")}</s-text>
        </s-paragraph>
      </s-section>

      <s-section heading={t("metricas.masDeseados")}>
        {deseados.length === 0 ? (
          <>
            <s-paragraph>{t("metricas.sinDatos")}</s-paragraph>
            <s-paragraph>
              <s-text color="subdued">{t("metricas.sinDatosAyuda")}</s-text>
            </s-paragraph>
          </>
        ) : (
          <>
            <s-paragraph>
              <s-text color="subdued">{t("metricas.masDeseadosAyuda")}</s-text>
            </s-paragraph>

            {/* Grilla fluida: en un teléfono queda una sola columna y nunca
                obliga a desplazar la página de lado, que es criterio de
                rechazo de la App Store. */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 14rem), 1fr))",
                gap: "1rem",
              }}
            >
              {deseados.map((p) => (
                <div
                  key={p.productId}
                  style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}
                >
                  {p.imagen ? (
                    <img
                      src={p.imagen}
                      alt=""
                      width={56}
                      height={56}
                      style={{
                        width: "3.5rem",
                        height: "3.5rem",
                        objectFit: "cover",
                        borderRadius: "6px",
                        flexShrink: 0,
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: "3.5rem",
                        height: "3.5rem",
                        borderRadius: "6px",
                        background: "rgba(128,128,128,0.15)",
                        flexShrink: 0,
                      }}
                    />
                  )}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600 }}>{p.title}</div>
                    <s-text color="subdued">
                      {p.guardados === 1
                        ? t("metricas.guardadoPorUno")
                        : ti("metricas.guardadoPor", { n: p.guardados })}
                      {p.precio ? ` · ${precioLegible(p.precio, p.moneda)}` : ""}
                    </s-text>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

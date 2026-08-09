import type { Shop } from "@prisma/client";

import prisma from "./db.server";
import { unauthenticated } from "./shopify.server";

/**
 * Lectura del plan de la tienda.
 *
 * La app no crea suscripciones ni toca dinero: Shopify muestra la página de
 * precios, cobra, y gestiona altas y bajas. Acá solo se LEE qué plan tiene
 * cada tienda.
 *
 * Se usa la Admin API y no la Partner API. La documentación de Shopify App
 * Pricing empuja hacia `activeSubscription(appId:, shopId:)` de la Partner
 * API, pero esa pide una credencial de organización: un secreto más que
 * guardar, rotar y proteger, que además no es por tienda. Para responder
 * "¿esta tienda paga?" alcanza con el token que ya tenemos.
 *
 * **No hay webhooks de suscripción.** Shopify lo dice explícitamente, así que
 * el sondeo no es una elección de diseño nuestra: es el único mecanismo que
 * existe. Una cancelación se ve cuando preguntamos, no antes.
 */

/** El único plan pago. Va en minúsculas: es el handle, no el nombre. */
export const HANDLE_PAGO = "pro";

export const PLAN_PAGO = "PRO";
export const PLAN_SIN_SUSCRIPCION = "FREE";

/** Cada cuánto se le vuelve a preguntar a Shopify. */
const TTL_MS = 5 * 60 * 1000;

/**
 * El resultado de preguntarle a Shopify, con los tres casos en el tipo.
 *
 * Que "no sé" y "no tiene" sean valores distintos y no un `string | null` es
 * deliberado: confundirlos es el error que hace que una cancelación no se
 * refleje nunca, o peor, que a alguien que está pagando se le corte el
 * servicio por un error de red.
 */
export type LecturaDeSuscripcion =
  | { estado: "confirmado"; handle: string | null }
  | { estado: "desconocido"; motivo: string };

const CONSULTA = `#graphql
  query lovelistSuscripcion {
    currentAppInstallation {
      activeSubscriptions {
        status
        lineItems {
          plan {
            pricingDetails {
              __typename
              ... on AppRecurringPricing {
                planHandle
              }
            }
          }
        }
      }
    }
  }
`;

type Suscripcion = {
  status?: string;
  lineItems?: { plan?: { pricingDetails?: { planHandle?: string } } }[];
};

/**
 * Le pregunta a Shopify qué suscripción tiene la tienda.
 *
 * `activeSubscriptions` es PLURAL: el singular no existe en la API.
 *
 * Se lee `planHandle` y NO `name`. El nombre viene traducido al idioma de la
 * tienda —"Standaard" en vez de "Standard"— y cualquier comparación contra él
 * falla en tiendas que no estén en inglés. El handle no se traduce.
 *
 * `planHandle` existe desde la versión 2025-07 de la API. En versiones
 * anteriores el campo no está y la respuesta vuelve sin él, sin decir por qué.
 */
export async function leerSuscripcion(
  shopDominio: string,
): Promise<LecturaDeSuscripcion> {
  try {
    const { admin } = await unauthenticated.admin(shopDominio);
    const respuesta = await admin.graphql(CONSULTA);
    const cuerpo = (await respuesta.json()) as {
      data?: { currentAppInstallation?: { activeSubscriptions?: Suscripcion[] } };
      errors?: unknown[];
    };

    // Con errores no sabemos nada, aunque venga `data`: una respuesta parcial
    // podría traer la lista vacía por un fallo y no porque no haya suscripción.
    if (cuerpo.errors?.length) {
      return {
        estado: "desconocido",
        motivo: `la API respondió con errores: ${JSON.stringify(cuerpo.errors).slice(0, 300)}`,
      };
    }

    const instalacion = cuerpo.data?.currentAppInstallation;
    if (!instalacion) {
      return { estado: "desconocido", motivo: "la respuesta no trajo currentAppInstallation" };
    }

    const suscripciones = instalacion.activeSubscriptions ?? [];
    const activas = suscripciones.filter((s) => s.status === "ACTIVE");

    // Una suscripción congelada o pendiente NO es "no tiene".
    //
    // FROZEN es un impago en curso: la tarjeta rebotó y Shopify está
    // reintentando. Leerlo como "sin suscripción" le cortaría el servicio a un
    // cliente que probablemente lo resuelve en horas. PENDING es una alta que
    // el merchant todavía no aprobó, o que Shopify no terminó de registrar.
    //
    // En los dos casos hay algo en curso y la respuesta correcta es "no sé":
    // se conserva lo que hubiera. Es la lección que DiscountFlow pagó cara.
    if (!activas.length) {
      const enCurso = suscripciones.find(
        (s) => s.status === "FROZEN" || s.status === "PENDING",
      );
      if (enCurso) {
        return {
          estado: "desconocido",
          motivo: `hay una suscripción en estado ${enCurso.status}`,
        };
      }

      // Sin errores, sin activas y sin nada en curso: esto NO es ambiguo. Es
      // la confirmación de que la tienda no está pagando.
      return { estado: "confirmado", handle: null };
    }

    for (const s of activas) {
      for (const item of s.lineItems ?? []) {
        const handle = item.plan?.pricingDetails?.planHandle;
        if (handle) return { estado: "confirmado", handle };
      }
    }

    // Hay suscripción activa pero no pudimos leerle el handle. No es "no
    // tiene": es que no entendimos la respuesta.
    return {
      estado: "desconocido",
      motivo: "hay una suscripción activa sin planHandle legible",
    };
  } catch (e) {
    return {
      estado: "desconocido",
      motivo: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * Deja `Shop.plan` al día, con la salvaguarda anti-degradación.
 *
 * Las reglas, en orden:
 *
 *  - confirmado con el handle pago  → se activa.
 *  - confirmado sin suscripciones   → **se baja**. Es una respuesta sana con
 *    lista vacía: confirmación, no ambigüedad. Sin esto, una cancelación no se
 *    reflejaría nunca y el merchant conservaría el plan pagado para siempre.
 *  - confirmado con un handle desconocido → **se conserva**. Puede ser un plan
 *    nuevo que existe en el dashboard y que este código todavía no sabe leer.
 *    Cortarle el servicio a alguien que paga es el peor error posible.
 *  - desconocido (error de red, de API, respuesta rara) → **se conserva**.
 *
 * Nada de tragarse los fallos en silencio: los dos casos que conservan el plan
 * dejan rastro. Un fallo silencioso en el sondeo convierte un error puntual en
 * uno permanente que nadie ve.
 */
export async function sincronizarPlan(shop: Shop): Promise<Shop> {
  const lectura = await leerSuscripcion(shop.domain);
  const ahora = new Date();

  if (lectura.estado === "desconocido") {
    console.warn(
      `[Lovelist] no se pudo leer la suscripción de ${shop.domain}, se conserva "${shop.plan}": ${lectura.motivo}`,
    );
    // No se toca `planRevisadoAt`: no llegamos a revisar nada, y marcarlo haría
    // que no se reintentara hasta que venza el TTL.
    return shop;
  }

  if (lectura.handle === null) {
    if (shop.plan === PLAN_SIN_SUSCRIPCION) {
      return prisma.shop.update({
        where: { id: shop.id },
        data: { planRevisadoAt: ahora },
      });
    }
    console.info(
      `[Lovelist] ${shop.domain} ya no tiene suscripción activa: baja de "${shop.plan}" a "${PLAN_SIN_SUSCRIPCION}"`,
    );
    return prisma.shop.update({
      where: { id: shop.id },
      data: {
        plan: PLAN_SIN_SUSCRIPCION,
        planActivatedAt: null,
        planRevisadoAt: ahora,
      },
    });
  }

  if (lectura.handle !== HANDLE_PAGO) {
    console.warn(
      `[Lovelist] ${shop.domain} tiene el plan "${lectura.handle}", que este código no conoce. Se conserva "${shop.plan}".`,
    );
    return shop;
  }

  return prisma.shop.update({
    where: { id: shop.id },
    data: {
      plan: PLAN_PAGO,
      planActivatedAt: shop.planActivatedAt ?? ahora,
      planRevisadoAt: ahora,
    },
  });
}

/** Sondea solo si la última lectura quedó vieja. */
export async function sincronizarPlanSiHaceFalta(shop: Shop): Promise<Shop> {
  const reciente =
    shop.planRevisadoAt && Date.now() - shop.planRevisadoAt.getTime() < TTL_MS;
  return reciente ? shop : sincronizarPlan(shop);
}

export function tienePlanActivo(shop: Pick<Shop, "plan"> | null): boolean {
  return shop?.plan === PLAN_PAGO;
}

/**
 * Cuántos productos entran en una lista según el plan.
 *
 * Esto reemplaza al paywall. La app **no se bloquea** sin suscripción: los
 * corazones, el panel, la página y compartir funcionan igual. Lo único que
 * cambia es cuántos favoritos entran por lista.
 *
 * Así el revisor de Shopify puede instalar y probar la app entera sin
 * suscribirse, que era el mayor riesgo de rechazo, y el merchant prueba antes
 * de pagar.
 *
 * El tope de PRO no es comercial: es la guarda contra abuso que existe desde
 * la Fase 2.1. El `anonymousId` lo genera el cliente y puede rotarlo, así que
 * alguna cota tiene que haber. Doscientos favoritos en una sola lista está muy
 * por encima de cualquier uso real.
 */
export const LIMITE_ITEMS_FREE = 10;
export const LIMITE_ITEMS_PRO = 200;

export function limiteItemsPorLista(shop: Pick<Shop, "plan"> | null): number {
  return tienePlanActivo(shop) ? LIMITE_ITEMS_PRO : LIMITE_ITEMS_FREE;
}

/**
 * El handle de la app, para armar la URL de la página de precios de Shopify.
 *
 * Sale de `shopify.app.toml`, horneado en el build: es el mismo valor que usa
 * Shopify, está versionado y viaja con el código. La variable de entorno gana
 * si existe, para poder apuntar a otra app sin tocar el archivo.
 *
 * Antes dependía **sólo** de la variable, sin reserva, con el argumento de que
 * un valor inventado llevaría a una página inexistente. El argumento vale para
 * un valor inventado; el del toml no lo es. Y el costo del faltante era el peor
 * posible: en producción la app andaba entera y el botón de pagar estaba
 * apagado.
 *
 * Devuelve `null` si tampoco está en el toml, y ahí la pantalla de planes lo
 * dice en vez de armar un enlace roto.
 */
export function handleDeLaApp(): string | null {
  // eslint-disable-next-line no-undef
  const deEntorno = process.env.SHOPIFY_APP_HANDLE?.trim();
  if (deEntorno) return deEntorno;

  // `__APP_HANDLE__` lo reemplaza Vite en el build. En un proceso que no pasó
  // por Vite —un script suelto de scripts/— no existe, y eso no puede tirar un
  // ReferenceError.
  const delToml = typeof __APP_HANDLE__ === "string" ? __APP_HANDLE__.trim() : "";
  return delToml ? delToml : null;
}

export function urlDePlanes(shopDominio: string): string | null {
  const handle = handleDeLaApp();
  if (!handle) return null;
  const tienda = shopDominio.replace(/\.myshopify\.com$/, "");
  return `https://admin.shopify.com/store/${tienda}/charges/${handle}/pricing_plans`;
}

import prisma from "./db.server";

/**
 * Operaciones de privacidad. Las llaman los webhooks obligatorios de Shopify.
 *
 * Todo lo que Lovelist guarda de un comprador son IDs: el customerId que
 * inyecta el App Proxy y los GIDs de los productos que marcó. Ni nombre, ni
 * email, ni dirección. Aun así, el borrado tiene que ser real.
 */

/** El payload trae el customerId como número; nosotros lo guardamos como texto. */
export function normalizarCustomerId(valor: unknown): string | null {
  if (typeof valor === "number" && Number.isFinite(valor)) return String(valor);
  if (typeof valor === "string" && /^\d+$/.test(valor.trim())) {
    return valor.trim();
  }
  return null;
}

export type ResultadoBorrado = {
  listas: number;
  items: number;
};

/**
 * customers/redact — borra las listas de ese cliente en esa tienda.
 * Los items caen por onDelete: Cascade.
 *
 * No tocamos las listas de invitado: no hay forma de vincular un anonymousId
 * con un cliente concreto una vez borrada la relación, y si el invitado ya se
 * fusionó a la cuenta (Fase 2.3) sus listas ya son del cliente.
 */
export async function borrarDatosDeCliente(
  shopDominio: string,
  customerIdCrudo: unknown,
): Promise<ResultadoBorrado> {
  const customerId = normalizarCustomerId(customerIdCrudo);
  if (!customerId) {
    throw new Error(`customers/redact sin customerId utilizable en ${shopDominio}`);
  }

  const shop = await prisma.shop.findUnique({ where: { domain: shopDominio } });
  if (!shop) return { listas: 0, items: 0 };

  const listas = await prisma.wishlist.findMany({
    where: { shopId: shop.id, customerId },
    select: { id: true, _count: { select: { items: true } } },
  });

  const items = listas.reduce((total, l) => total + l._count.items, 0);
  const { count } = await prisma.wishlist.deleteMany({
    where: { shopId: shop.id, customerId },
  });

  return { listas: count, items };
}

/**
 * shop/redact — borra todo lo de esa tienda.
 * Borrar la fila de Shop arrastra wishlists e items por Cascade; las sesiones
 * cuelgan del dominio, no de Shop, así que van aparte.
 */
export async function borrarDatosDeTienda(
  shopDominio: string,
): Promise<ResultadoBorrado & { sesiones: number }> {
  const shop = await prisma.shop.findUnique({
    where: { domain: shopDominio },
    select: {
      id: true,
      _count: { select: { wishlists: true } },
    },
  });

  const items = shop
    ? await prisma.wishlistItem.count({
        where: { wishlist: { shopId: shop.id } },
      })
    : 0;

  if (shop) await prisma.shop.delete({ where: { id: shop.id } });

  const { count: sesiones } = await prisma.session.deleteMany({
    where: { shop: shopDominio },
  });

  return { listas: shop?._count.wishlists ?? 0, items, sesiones };
}

/**
 * customers/data_request — reúne lo que tenemos de ese cliente.
 *
 * Shopify no recibe estos datos por el webhook: el merchant tiene 30 días para
 * entregárselos al comprador y nos los pide a nosotros. Lo dejamos registrado
 * de forma estructurada para poder responder, sin datos personales en el log.
 */
export async function exportarDatosDeCliente(
  shopDominio: string,
  customerIdCrudo: unknown,
) {
  const customerId = normalizarCustomerId(customerIdCrudo);
  if (!customerId) {
    throw new Error(`customers/data_request sin customerId utilizable en ${shopDominio}`);
  }

  const shop = await prisma.shop.findUnique({ where: { domain: shopDominio } });
  if (!shop) return { customerId, listas: [] };

  const listas = await prisma.wishlist.findMany({
    where: { shopId: shop.id, customerId },
    include: { items: { orderBy: { addedAt: "asc" } } },
  });

  return {
    customerId,
    listas: listas.map((l) => ({
      nombre: l.name,
      creada: l.createdAt.toISOString(),
      compartida: Boolean(l.shareToken),
      productos: l.items.map((i) => ({
        productId: i.productId,
        variantId: i.variantId,
        agregado: i.addedAt.toISOString(),
      })),
    })),
  };
}

/**
 * app/uninstalled — limpia sesiones y marca la tienda.
 *
 * No borramos las wishlists: si el merchant reinstala, los compradores
 * recuperan lo suyo. El borrado definitivo lo pide shop/redact, que Shopify
 * envía 48 horas después de la desinstalación si no se reinstala.
 */
export async function marcarDesinstalada(shopDominio: string) {
  const { count: sesiones } = await prisma.session.deleteMany({
    where: { shop: shopDominio },
  });

  const actualizadas = await prisma.shop.updateMany({
    where: { domain: shopDominio },
    data: {
      uninstalledAt: new Date(),
      // Desinstalar es dejar de pagar: el plan baja. Y `planRevisadoAt` va a
      // null para que el primer sondeo tras reinstalar consulte de verdad en
      // vez de confiarse de la ventana de cinco minutos. Es la lección de
      // DiscountFlow: sin eso, un merchant que reinstala con la suscripción
      // viva puede pasar minutos viendo la app en pausa sin motivo.
      plan: "FREE",
      planActivatedAt: null,
      planRevisadoAt: null,
    },
  });

  return { sesiones, tiendaMarcada: actualizadas.count > 0 };
}

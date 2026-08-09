import prisma from "./db.server";

/**
 * Métricas del dashboard.
 *
 * Todo sale de nuestra base salvo los datos de producto, que se resuelven
 * contra la Admin API con `read_products`, el único scope que pedimos.
 */

const DIAS_VENTANA = 30;

function desdeHace(dias: number): Date {
  return new Date(Date.now() - dias * 24 * 60 * 60 * 1000);
}

/** Un clic en "agregar al carrito" desde Lovelist, por cada variante enviada. */
export async function registrarAgregadoAlCarrito(
  shopId: string,
  variantIds: unknown[],
): Promise<number> {
  const limpias = variantIds
    .map((v) => String(v ?? "").trim())
    .filter((v) => v && v.length <= 40)
    // Sin repetir: "agregar todo" ya deduplica antes de mandar, pero la
    // métrica no puede depender de que el cliente se porte bien.
    .filter((v, i, todas) => todas.indexOf(v) === i)
    .slice(0, 100);

  if (!limpias.length) return 0;

  const { count } = await prisma.eventoCarrito.createMany({
    data: limpias.map((variantId) => ({ shopId, variantId })),
  });
  return count;
}

/**
 * Cuántas listas de la tienda ya no pueden guardar más.
 *
 * Es lo que convierte el límite en algo accionable para el merchant: si nadie
 * lo toca, el aviso no aparece y no hay ruido. Cuando aparece, es el momento
 * exacto en que subir de plan tiene sentido.
 *
 * Va en SQL crudo por lo mismo que `masDeseados`: `WishlistItem` no tiene
 * `shopId` y el `groupBy` de Prisma no agrupa a través de una relación.
 */
export async function listasEnElLimite(
  shopId: string,
  limite: number,
): Promise<number> {
  const filas = await prisma.$queryRaw<{ cuantas: bigint }[]>`
    SELECT COUNT(*)::bigint AS cuantas FROM (
      SELECT i."wishlistId"
      FROM "WishlistItem" i
      JOIN "Wishlist" w ON w."id" = i."wishlistId"
      WHERE w."shopId" = ${shopId}
      GROUP BY i."wishlistId"
      HAVING COUNT(*) >= ${limite}
    ) AS llenas
  `;
  return Number(filas[0]?.cuantas ?? 0);
}

export type ProductoDeseado = {
  productId: string;
  guardados: number;
};

export type Kpis = {
  listas: number;
  favoritos: number;
  favoritosUltimos30: number;
  agregadosAlCarrito: number;
  agregadosAlCarritoUltimos30: number;
};

/**
 * Los números de arriba del dashboard.
 *
 * Van en una sola transacción para que no se contradigan entre sí: sin eso,
 * "favoritos" podría leerse después de un alta que "favoritos de 30 días" no
 * vio, y el merchant vería un total menor que su propia ventana.
 */
export async function kpis(shopId: string): Promise<Kpis> {
  const corte = desdeHace(DIAS_VENTANA);

  const [listas, favoritos, favoritosUltimos30, alCarrito, alCarrito30] =
    await prisma.$transaction([
      prisma.wishlist.count({ where: { shopId } }),
      prisma.wishlistItem.count({ where: { wishlist: { shopId } } }),
      prisma.wishlistItem.count({
        where: { wishlist: { shopId }, addedAt: { gte: corte } },
      }),
      prisma.eventoCarrito.count({ where: { shopId } }),
      prisma.eventoCarrito.count({
        where: { shopId, creadoAt: { gte: corte } },
      }),
    ]);

  return {
    listas,
    favoritos,
    favoritosUltimos30,
    agregadosAlCarrito: alCarrito,
    agregadosAlCarritoUltimos30: alCarrito30,
  };
}

/**
 * Los productos más guardados de la tienda.
 *
 * Va en SQL crudo porque `WishlistItem` no tiene `shopId` —cuelga de la lista—
 * y el `groupBy` de Prisma no sabe agrupar a través de una relación. La
 * alternativa era traer los ids de todas las listas y meterlos en un `IN`, que
 * en una tienda con miles de listas es una consulta enorme.
 *
 * Se cuenta por producto y no por producto+variante: al merchant le interesa
 * qué artículo desean, no en qué talle.
 */
export async function masDeseados(
  shopId: string,
  limite = 10,
): Promise<ProductoDeseado[]> {
  const filas = await prisma.$queryRaw<{ productId: string; guardados: bigint }[]>`
    SELECT i."productId", COUNT(DISTINCT i."wishlistId")::bigint AS guardados
    FROM "WishlistItem" i
    JOIN "Wishlist" w ON w."id" = i."wishlistId"
    WHERE w."shopId" = ${shopId}
    GROUP BY i."productId"
    ORDER BY guardados DESC, i."productId" ASC
    LIMIT ${limite}
  `;

  return filas.map((f) => ({
    productId: f.productId,
    // `COUNT` vuelve como BigInt y `JSON.stringify` no sabe serializarlo: si
    // se le escapa uno al loader, la página revienta con "Do not know how to
    // serialize a BigInt" y no dice dónde.
    guardados: Number(f.guardados),
  }));
}

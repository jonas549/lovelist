import { unauthenticated } from "./shopify.server";

/**
 * Resolución de productos contra la Admin API.
 *
 * Esto es lo que la Fase 2.2 no podía hacer. La base guarda solo IDs (decisión
 * del plan: nada de datos de producto), y el storefront no puede pedir un
 * producto por ID sin credenciales, así que el drawer dependía de un caché de
 * handles en localStorage que se pierde entre dispositivos. Acá se resuelve de
 * verdad: el servidor tiene el token offline de la tienda y el scope
 * read_products.
 *
 * Nada de esto se guarda. Se lee en el momento de mostrar, que es justamente
 * lo que evita servir precios viejos y productos borrados.
 */

const CONSULTA = `#graphql
  query lovelistProductos($productos: [ID!]!, $variantes: [ID!]!) {
    productos: nodes(ids: $productos) {
      ... on Product {
        id
        title
        handle
        status
        publishedAt
        featuredMedia { preview { image { url(transform: {maxWidth: 400, maxHeight: 400}) altText } } }
        priceRangeV2 { minVariantPrice { amount currencyCode } }
        variants(first: 10) {
          nodes { id availableForSale price }
        }
      }
    }
    variantes: nodes(ids: $variantes) {
      ... on ProductVariant {
        id
        title
        availableForSale
        price
        product { id hasOnlyDefaultVariant }
      }
    }
  }
`;

export type ProductoResuelto = {
  productId: string;
  title: string;
  handle: string;
  url: string;
  imagen: string | null;
  imagenAlt: string;
  precio: string;
  moneda: string;
  disponible: boolean;
  /** Variante numérica lista para /cart/add.js. null si no hay ninguna vendible. */
  variantIdParaCarrito: string | null;
  varianteTitulo: string | null;
};

type Referencia = { productId: string; variantId: string | null };

function numerico(gid: string): string {
  return gid.slice(gid.lastIndexOf("/") + 1);
}

/**
 * Devuelve un mapa productId -> datos, omitiendo lo que ya no se puede mostrar.
 *
 * Se omiten a propósito, no se rompe la página: un producto borrado, archivado,
 * en borrador o despublicado del canal online simplemente desaparece de la
 * lista. Es lo que pide el plan y es lo que espera el comprador.
 */
export async function resolverProductos(
  shopDominio: string,
  referencias: Referencia[],
): Promise<Map<string, ProductoResuelto>> {
  const resultado = new Map<string, ProductoResuelto>();
  if (!referencias.length) return resultado;

  const idsProducto = [...new Set(referencias.map((r) => r.productId))];
  const idsVariante = [
    ...new Set(referencias.map((r) => r.variantId).filter(Boolean)),
  ] as string[];

  const { admin } = await unauthenticated.admin(shopDominio);
  const respuesta = await admin.graphql(CONSULTA, {
    variables: { productos: idsProducto, variantes: idsVariante },
  });
  const cuerpo = (await respuesta.json()) as {
    data?: {
      productos?: (ProductoCrudo | null)[];
      variantes?: (VarianteCruda | null)[];
    };
  };

  const variantesPorId = new Map<string, VarianteCruda>();
  for (const v of cuerpo.data?.variantes ?? []) {
    if (v?.id) variantesPorId.set(v.id, v);
  }

  for (const p of cuerpo.data?.productos ?? []) {
    if (!p?.id) continue;

    // Borrado, archivado, en borrador o despublicado del canal online: se oculta.
    //
    // El filtro va por `publishedAt`, que es la fecha de publicación en Online
    // Store, y NO por `onlineStoreUrl`. Ese último parece el campo obvio pero
    // vuelve null en cuanto la tienda tiene contraseña —todas las de
    // desarrollo la tienen—, así que habría escondido el catálogo entero.
    if (p.status !== "ACTIVE" || !p.publishedAt) continue;

    const variantes = p.variants?.nodes ?? [];
    const vendible = variantes.find((v) => v.availableForSale) ?? null;

    resultado.set(p.id, {
      productId: p.id,
      title: p.title,
      handle: p.handle,
      url: `/products/${p.handle}`,
      imagen: p.featuredMedia?.preview?.image?.url ?? null,
      imagenAlt: p.featuredMedia?.preview?.image?.altText ?? p.title,
      precio: p.priceRangeV2?.minVariantPrice?.amount ?? "0",
      moneda: p.priceRangeV2?.minVariantPrice?.currencyCode ?? "",
      disponible: Boolean(vendible),
      variantIdParaCarrito: vendible ? numerico(vendible.id) : null,
      varianteTitulo: null,
    });
  }

  // Si el item guardó una variante concreta, manda esa: es la que el comprador
  // eligió. Solo se ignora si esa variante ya no se puede comprar.
  for (const ref of referencias) {
    if (!ref.variantId) continue;
    const producto = resultado.get(ref.productId);
    const variante = variantesPorId.get(ref.variantId);
    if (!producto || !variante) continue;

    // Un producto sin opciones reales igual tiene una variante, y Shopify la
    // llama "Default Title". Es un nombre interno: mostrarlo debajo del titulo
    // no le dice nada al comprador y encima desalinea la tarjeta con una linea
    // de mas. Se pregunta por `hasOnlyDefaultVariant` en vez de comparar contra
    // el string, que es un valor interno que no tenemos garantizado.
    producto.varianteTitulo = variante.product?.hasOnlyDefaultVariant
      ? null
      : variante.title ?? null;

    if (variante.availableForSale) {
      producto.variantIdParaCarrito = numerico(variante.id);
      producto.disponible = true;
      producto.precio = variante.price ?? producto.precio;
    }
  }

  return resultado;
}

type ProductoCrudo = {
  id: string;
  title: string;
  handle: string;
  status: string;
  publishedAt: string | null;
  featuredMedia?: {
    preview?: { image?: { url?: string; altText?: string | null } | null } | null;
  } | null;
  priceRangeV2?: {
    minVariantPrice?: { amount?: string; currencyCode?: string };
  } | null;
  variants?: { nodes?: { id: string; availableForSale: boolean; price: string }[] };
};

type VarianteCruda = {
  id: string;
  title?: string | null;
  availableForSale: boolean;
  price?: string;
  product?: { id: string; hasOnlyDefaultVariant?: boolean } | null;
};

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
  /** productId|variantId — identifica al FAVORITO, no al producto. */
  clave: string;
  productId: string;
  /** La variante que el comprador eligió al guardar, o null si no eligió. */
  variantId: string | null;
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

/**
 * La identidad de un favorito es el par producto+variante, no el producto.
 *
 * Guardar la camisa negra y la blanca son dos decisiones distintas del
 * comprador y se muestran como dos favoritos. Colapsarlas lo obligaría a
 * volver a elegir algo que ya había elegido.
 *
 * Tiene que coincidir con `claveItem` de wishlist.server.ts y con la del JS
 * del storefront: las tres nombran la misma cosa.
 */
export function claveDeItem(referencia: Referencia): string {
  return referencia.productId + "|" + (referencia.variantId ?? "");
}

function numerico(gid: string): string {
  return gid.slice(gid.lastIndexOf("/") + 1);
}

/**
 * Devuelve un mapa clave(producto|variante) -> datos, omitiendo lo que ya no se
 * puede mostrar.
 *
 * Se omiten a propósito, no se rompe la página: un producto borrado, archivado,
 * en borrador o despublicado del canal online simplemente desaparece de la
 * lista. Es lo que pide el plan y es lo que espera el comprador.
 *
 * Va indexado por favorito y no por producto. Cuando iba por producto, dos
 * favoritos del mismo artículo se pisaban: el último en resolverse le
 * sobreescribía la variante al otro, y los dos terminaban mostrando lo mismo.
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

  const productosPorId = new Map<string, ProductoCrudo>();
  for (const p of cuerpo.data?.productos ?? []) {
    if (!p?.id) continue;

    // Borrado, archivado, en borrador o despublicado del canal online: se oculta.
    //
    // El filtro va por `publishedAt`, que es la fecha de publicación en Online
    // Store, y NO por `onlineStoreUrl`. Ese último parece el campo obvio pero
    // vuelve null en cuanto la tienda tiene contraseña —todas las de
    // desarrollo la tienen—, así que habría escondido el catálogo entero.
    if (p.status !== "ACTIVE" || !p.publishedAt) continue;

    productosPorId.set(p.id, p);
  }

  // Una entrada por FAVORITO. Dos favoritos del mismo producto —uno guardado
  // desde una colección sin elegir variante, otro desde la ficha con la
  // variante elegida— son dos entradas independientes, cada una con su precio,
  // su disponibilidad y su nombre de variante.
  for (const ref of referencias) {
    const clave = claveDeItem(ref);
    if (resultado.has(clave)) continue;

    const p = productosPorId.get(ref.productId);
    if (!p) continue;

    const variantes = p.variants?.nodes ?? [];
    const vendiblePorDefecto = variantes.find((v) => v.availableForSale) ?? null;

    const entrada: ProductoResuelto = {
      clave,
      productId: p.id,
      variantId: ref.variantId,
      title: p.title,
      handle: p.handle,
      url: `/products/${p.handle}`,
      imagen: p.featuredMedia?.preview?.image?.url ?? null,
      imagenAlt: p.featuredMedia?.preview?.image?.altText ?? p.title,
      precio: p.priceRangeV2?.minVariantPrice?.amount ?? "0",
      moneda: p.priceRangeV2?.minVariantPrice?.currencyCode ?? "",
      disponible: Boolean(vendiblePorDefecto),
      variantIdParaCarrito: vendiblePorDefecto
        ? numerico(vendiblePorDefecto.id)
        : null,
      // Sin variante elegida no se muestra ninguna, aunque abajo se use la
      // primera vendible para el carrito: poner el nombre de una variante que
      // el comprador no eligió es inventarle una decisión que no tomó, y hace
      // que los dos favoritos del mismo producto se vean iguales.
      varianteTitulo: null,
    };

    // Si el favorito guardó una variante concreta, manda esa: es la que el
    // comprador eligió. Solo se ignora para el carrito si ya no se puede
    // comprar, pero el nombre se sigue mostrando.
    const guardada = ref.variantId
      ? variantesPorId.get(ref.variantId)
      : undefined;

    // La variante tiene que ser DE ESTE producto.
    //
    // No es paranoia: hubo una versión del JS del storefront que, al guardar
    // desde la ficha de otro producto, se llevaba la variante de la página. El
    // favorito quedaba con el producto de uno y la variante de otro, y acá se
    // mostraba con el título del suyo pero el precio y el "agregar al carrito"
    // del ajeno — parecía que la tarjeta apuntaba a otro producto.
    //
    // Aquel bug ya está arreglado en origen, pero las filas que dejó siguen en
    // la base de cada tienda y no las vamos a poder migrar una por una. Con
    // esto se muestran como lo que son: el producto guardado, sin variante.
    const variante =
      guardada && guardada.product?.id === ref.productId ? guardada : undefined;

    if (variante) {
      // Un producto sin opciones reales igual tiene una variante, y Shopify la
      // llama "Default Title". Es un nombre interno: mostrarlo debajo del
      // titulo no le dice nada al comprador y encima desalinea la tarjeta con
      // una linea de mas. Se pregunta por `hasOnlyDefaultVariant` en vez de
      // comparar contra el string, que es un valor interno sin garantía.
      entrada.varianteTitulo = variante.product?.hasOnlyDefaultVariant
        ? null
        : variante.title ?? null;

      if (variante.availableForSale) {
        entrada.variantIdParaCarrito = numerico(variante.id);
        entrada.disponible = true;
        entrada.precio = variante.price ?? entrada.precio;
      } else {
        // La variante elegida se agotó. No se ofrece otra en su lugar: el
        // comprador quiso ESA. Mejor mostrarla agotada que venderle otra.
        entrada.disponible = false;
        entrada.variantIdParaCarrito = null;
      }
    }

    resultado.set(clave, entrada);
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

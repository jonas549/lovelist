import crypto from "node:crypto";

import prisma from "./db.server";
import { t } from "./i18n";
import {
  ErrorApi,
  LIMITES,
  RUTA_PROXY_PUBLICA,
  type Identidad,
} from "./proxy.server";

/**
 * Filtro de propiedad. Va en TODA consulta: una lista solo es visible y
 * modificable por la identidad que la creó. Adivinar un id no alcanza.
 */
function filtroIdentidad(identidad: Identidad) {
  return identidad.tipo === "cliente"
    ? { customerId: identidad.customerId, anonymousId: null }
    : { anonymousId: identidad.anonymousId, customerId: null };
}

function esErrorDeUnicidad(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    (e as { code?: unknown }).code === "P2002"
  );
}

// ---------------------------------------------------------------------------
// Validación de entrada
// ---------------------------------------------------------------------------

function validarNombre(valor: unknown): string {
  if (typeof valor !== "string") throw new ErrorApi(400, "nombreRequerido");
  const limpio = valor.trim();
  if (!limpio) throw new ErrorApi(400, "nombreRequerido");
  if (limpio.length > LIMITES.largoNombreLista) {
    throw new ErrorApi(400, "nombreMuyLargo");
  }
  return limpio;
}

/**
 * El storefront recibe IDs numéricos de Liquid (`product.id`), pero guardamos
 * GIDs porque es lo que consume la Admin API en la Fase 2.5. Aceptamos las dos
 * formas y normalizamos a GID.
 */
function normalizarGid(
  valor: unknown,
  tipo: "Product" | "ProductVariant",
): string | null {
  if (typeof valor !== "string") return null;
  const limpio = valor.trim();
  if (!limpio) return null;
  if (/^\d+$/.test(limpio)) return `gid://shopify/${tipo}/${limpio}`;
  const prefijo = `gid://shopify/${tipo}/`;
  if (limpio.startsWith(prefijo) && /^\d+$/.test(limpio.slice(prefijo.length))) {
    return limpio;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Serialización
// ---------------------------------------------------------------------------

type ListaConItems = {
  id: string;
  name: string;
  isDefault: boolean;
  shareToken: string | null;
  createdAt: Date;
  items: {
    id: string;
    productId: string;
    variantId: string | null;
    addedAt: Date;
  }[];
};

export function urlParaCompartir(shopDominio: string, token: string): string {
  return `https://${shopDominio}${RUTA_PROXY_PUBLICA}/shared/${token}`;
}

export function serializarLista(lista: ListaConItems, shopDominio: string) {
  return {
    id: lista.id,
    name: lista.name,
    isDefault: lista.isDefault,
    shareToken: lista.shareToken,
    shareUrl: lista.shareToken
      ? urlParaCompartir(shopDominio, lista.shareToken)
      : null,
    itemCount: lista.items.length,
    items: lista.items.map((i) => ({
      id: i.id,
      productId: i.productId,
      variantId: i.variantId,
      addedAt: i.addedAt.toISOString(),
    })),
  };
}

const incluirItems = {
  items: { orderBy: { addedAt: "desc" } as const },
} as const;

// ---------------------------------------------------------------------------
// Operaciones
// ---------------------------------------------------------------------------

export function listarListas(shopId: string, identidad: Identidad) {
  return prisma.wishlist.findMany({
    where: { shopId, ...filtroIdentidad(identidad) },
    include: incluirItems,
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });
}

/** Busca una lista comprobando propiedad. 404 si no es tuya: no filtramos si existe. */
async function buscarListaPropia(
  shopId: string,
  identidad: Identidad,
  listaId: unknown,
) {
  if (typeof listaId !== "string" || !listaId) {
    throw new ErrorApi(404, "listaNoEncontrada");
  }
  const lista = await prisma.wishlist.findFirst({
    where: { id: listaId, shopId, ...filtroIdentidad(identidad) },
    include: incluirItems,
  });
  if (!lista) throw new ErrorApi(404, "listaNoEncontrada");
  return lista;
}

export async function crearLista(
  shopId: string,
  identidad: Identidad,
  nombreCrudo: unknown,
) {
  const name = validarNombre(nombreCrudo);

  const cuantas = await prisma.wishlist.count({
    where: { shopId, ...filtroIdentidad(identidad) },
  });
  if (cuantas >= LIMITES.listasPorIdentidad) {
    throw new ErrorApi(409, "demasiadasListas");
  }

  return prisma.wishlist.create({
    data: { shopId, ...filtroIdentidad(identidad), name, isDefault: false },
    include: incluirItems,
  });
}

export async function renombrarLista(
  shopId: string,
  identidad: Identidad,
  listaId: unknown,
  nombreCrudo: unknown,
) {
  const lista = await buscarListaPropia(shopId, identidad, listaId);
  const name = validarNombre(nombreCrudo);

  return prisma.wishlist.update({
    where: { id: lista.id },
    data: { name },
    include: incluirItems,
  });
}

export async function borrarLista(
  shopId: string,
  identidad: Identidad,
  listaId: unknown,
) {
  const lista = await buscarListaPropia(shopId, identidad, listaId);
  if (lista.isDefault) {
    throw new ErrorApi(409, "noSePuedeBorrarPredeterminada");
  }
  // Los items caen por onDelete: Cascade.
  await prisma.wishlist.delete({ where: { id: lista.id } });
  return lista.id;
}

/**
 * La lista "Favoritos" se crea sola la primera vez que alguien guarda algo.
 * Si dos peticiones simultáneas intentan crearla, el índice de identidad no lo
 * impide, así que reintentamos la búsqueda antes de rendirnos.
 */
export async function obtenerOCrearListaPredeterminada(
  shopId: string,
  identidad: Identidad,
) {
  const existente = await prisma.wishlist.findFirst({
    where: { shopId, ...filtroIdentidad(identidad), isDefault: true },
    include: incluirItems,
  });
  if (existente) return existente;

  return prisma.wishlist.create({
    data: {
      shopId,
      ...filtroIdentidad(identidad),
      name: t("wishlist.listaPredeterminada"),
      isDefault: true,
    },
    include: incluirItems,
  });
}

export async function agregarItem(
  shopId: string,
  identidad: Identidad,
  cuerpo: Record<string, unknown>,
) {
  const productId = normalizarGid(cuerpo.productId, "Product");
  if (!productId) throw new ErrorApi(400, "productoRequerido");

  let variantId: string | null = null;
  if (cuerpo.variantId !== undefined && cuerpo.variantId !== null && cuerpo.variantId !== "") {
    variantId = normalizarGid(cuerpo.variantId, "ProductVariant");
    if (!variantId) throw new ErrorApi(400, "cuerpoInvalido");
  }

  const lista =
    cuerpo.listId === undefined || cuerpo.listId === null || cuerpo.listId === ""
      ? await obtenerOCrearListaPredeterminada(shopId, identidad)
      : await buscarListaPropia(shopId, identidad, cuerpo.listId);

  const cuantos = await prisma.wishlistItem.count({
    where: { wishlistId: lista.id },
  });
  if (cuantos >= LIMITES.itemsPorLista) {
    throw new ErrorApi(409, "listaLlena");
  }

  try {
    return {
      lista,
      item: await prisma.wishlistItem.create({
        data: { wishlistId: lista.id, productId, variantId },
      }),
      creado: true,
    };
  } catch (e) {
    if (!esErrorDeUnicidad(e)) throw e;
    // Ya estaba guardado. Alta idempotente: no es un error para el comprador.
    const item = await prisma.wishlistItem.findFirst({
      where: { wishlistId: lista.id, productId, variantId },
    });
    if (!item) throw e;
    return { lista, item, creado: false };
  }
}

export async function quitarItem(
  shopId: string,
  identidad: Identidad,
  itemId: unknown,
) {
  if (typeof itemId !== "string" || !itemId) {
    throw new ErrorApi(404, "itemNoEncontrado");
  }

  // La propiedad se comprueba a través de la lista, no del item.
  const item = await prisma.wishlistItem.findFirst({
    where: {
      id: itemId,
      wishlist: { shopId, ...filtroIdentidad(identidad) },
    },
  });
  if (!item) throw new ErrorApi(404, "itemNoEncontrado");

  await prisma.wishlistItem.delete({ where: { id: item.id } });
  return { itemId: item.id, listId: item.wishlistId };
}

/**
 * Genera el shareToken. Criptográficamente aleatorio y sin relación con el id
 * de la lista: 24 bytes en base64url son 32 caracteres.
 * Idempotente: si ya se compartió, devuelve el token que ya tenía.
 */
export async function compartirLista(
  shopId: string,
  identidad: Identidad,
  listaId: unknown,
) {
  const lista = await buscarListaPropia(shopId, identidad, listaId);
  if (lista.shareToken) return lista;

  return prisma.wishlist.update({
    where: { id: lista.id },
    data: { shareToken: crypto.randomBytes(24).toString("base64url") },
    include: incluirItems,
  });
}

import crypto from "node:crypto";

import prisma from "./db.server";
import { t } from "./i18n";
import {
  ErrorApi,
  LIMITES,
  RUTA_PROXY_PUBLICA,
  esUuid,
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

/**
 * Busca una lista por su token público. No hace falta identidad: el token ES
 * la credencial.
 *
 * Se exige que la lista pertenezca a la tienda desde la que llega la petición,
 * para que un token de una tienda no se pueda abrir a través del proxy de otra.
 */
export async function buscarListaCompartida(
  shopId: string,
  token: unknown,
) {
  if (typeof token !== "string" || token.length < 20) return null;
  return prisma.wishlist.findFirst({
    where: { shareToken: token, shopId },
    include: incluirItems,
  });
}

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
  /**
   * Cuántos favoritos entran en la lista. Lo decide el plan de la tienda, no
   * una constante: es el único lugar donde el cobro toca al comprador.
   */
  limiteItems: number,
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

  // El límite se mira DESPUÉS de descartar que ya esté guardado, y no antes.
  // Si no, una lista llena contesta "está llena" a alguien que no está
  // agregando nada —vuelve a mandar lo mismo porque tiene dos pestañas
  // abiertas, o porque reintenta tras un fallo de red— y el comprador se queda
  // sin entender qué hacer. El límite es para las altas nuevas.
  const yaEstaba = await prisma.wishlistItem.findFirst({
    where: { wishlistId: lista.id, productId, variantId },
  });
  if (yaEstaba) return { lista, item: yaEstaba, creado: false };

  const cuantos = await prisma.wishlistItem.count({
    where: { wishlistId: lista.id },
  });
  // Los favoritos que ya estén por encima del límite NO se borran ni se
  // esconden: se siguen viendo y se pueden quitar. Lo único que no se puede es
  // agregar más. Si la tienda baja de PRO a FREE, nadie pierde nada.
  if (cuantos >= limiteItems) {
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
    // Dos altas iguales al mismo tiempo: la lectura de arriba no vio nada y la
    // unicidad de la base cortó la segunda. Alta idempotente, no un error.
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

/** Clave de igualdad de un item. Espeja el índice único con NULLS NOT DISTINCT. */
function claveItem(i: { productId: string; variantId: string | null }): string {
  return i.productId + "|" + (i.variantId ?? "");
}

export type ResultadoFusion = {
  listasMovidas: number;
  listasFusionadas: number;
  itemsMovidos: number;
  itemsDuplicados: number;
};

/**
 * Fusiona las listas de un invitado con las del cliente que acaba de iniciar
 * sesión. Fusiona, nunca reemplaza: lo que el cliente ya tenía no se toca.
 *
 * Empareja por nombre. Si el cliente no tiene una lista con ese nombre, la
 * lista anónima se le reasigna en vez de copiarse: así conserva su id, sus
 * items y —lo que importa— su shareToken, de modo que un link que el invitado
 * ya había compartido sigue funcionando después de que se registre.
 *
 * Idempotente: al terminar no quedan listas anónimas, así que una segunda
 * corrida no encuentra nada que hacer.
 *
 * Los duplicados se detectan comparando en memoria contra los items que ya
 * tiene el destino, y no dejando que salte el índice único. Dentro de una
 * transacción de Postgres, capturar el error de unicidad deja la transacción
 * abortada y todo lo que sigue falla.
 *
 * No aplicamos los topes de listas ni de items: recortar acá sería perder
 * favoritos del comprador en el momento en que se registra, que es justo cuando
 * más confianza nos está dando. El resultado puede quedar por encima del tope;
 * los topes vuelven a aplicar en la siguiente creación, así que el estado se
 * corrige solo y está acotado (nunca más del doble).
 */
export async function fusionarInvitado(
  shopId: string,
  customerId: string,
  anonymousIdCrudo: unknown,
): Promise<ResultadoFusion> {
  if (!esUuid(anonymousIdCrudo)) {
    throw new ErrorApi(400, "identidadInvalida");
  }
  const anonymousId = anonymousIdCrudo.toLowerCase();

  return prisma.$transaction(
    async (tx) => {
      const anonimas = await tx.wishlist.findMany({
        where: { shopId, anonymousId, customerId: null },
        include: { items: true },
        orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
      });

      const resultado: ResultadoFusion = {
        listasMovidas: 0,
        listasFusionadas: 0,
        itemsMovidos: 0,
        itemsDuplicados: 0,
      };
      if (!anonimas.length) return resultado;

      const delCliente = await tx.wishlist.findMany({
        where: { shopId, customerId, anonymousId: null },
        include: { items: { select: { productId: true, variantId: true } } },
      });

      // Índice de destinos: por nombre, y aparte cuál es la predeterminada.
      const porNombre = new Map<string, { id: string; claves: Set<string> }>();
      let predeterminada: { id: string; claves: Set<string> } | null = null;

      for (const l of delCliente) {
        const entrada = { id: l.id, claves: new Set(l.items.map(claveItem)) };
        porNombre.set(l.name, entrada);
        if (l.isDefault) predeterminada = entrada;
      }

      for (const anon of anonimas) {
        const destino = anon.isDefault
          ? predeterminada ?? porNombre.get(anon.name) ?? null
          : porNombre.get(anon.name) ?? null;

        if (!destino) {
          // No hay con qué fusionarla: se la reasignamos tal cual.
          await tx.wishlist.update({
            where: { id: anon.id },
            data: { customerId, anonymousId: null },
          });
          const entrada = {
            id: anon.id,
            claves: new Set(anon.items.map(claveItem)),
          };
          porNombre.set(anon.name, entrada);
          if (anon.isDefault && !predeterminada) predeterminada = entrada;
          resultado.listasMovidas++;
          continue;
        }

        const aMover: string[] = [];
        for (const item of anon.items) {
          const clave = claveItem(item);
          if (destino.claves.has(clave)) {
            resultado.itemsDuplicados++;
            continue; // se va con la lista anónima al borrarla
          }
          destino.claves.add(clave);
          aMover.push(item.id);
        }

        if (aMover.length) {
          // Un updateMany por lista y no uno por item: con 20 listas de 200
          // items, ir de a uno se pasaría del tiempo máximo de la transacción.
          await tx.wishlistItem.updateMany({
            where: { id: { in: aMover } },
            data: { wishlistId: destino.id },
          });
          resultado.itemsMovidos += aMover.length;
        }

        // Los duplicados que quedaron caen por onDelete: Cascade.
        await tx.wishlist.delete({ where: { id: anon.id } });
        resultado.listasFusionadas++;
      }

      return resultado;
    },
    { timeout: 15000 },
  );
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

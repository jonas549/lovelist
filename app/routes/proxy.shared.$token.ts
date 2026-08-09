import type { LoaderFunctionArgs } from "react-router";

import {
  SCRIPT_NOINDEX,
  escaparLiquid,
  respuestaLiquid,
} from "../liquid.server";
import { buscarShop, manejar, verificarFirmaProxy } from "../proxy.server";
import {
  claveDeItem,
  resolverProductos,
  type ProductoResuelto,
} from "../productos.server";
import { buscarListaCompartida } from "../wishlist.server";
import { t } from "../i18n";

/**
 * GET /apps/lovelist/shared/:token — la vista de solo lectura.
 *
 * Va entera del servidor: el token identifica la lista, así que no hace falta
 * saber quién mira. Eso permite que funcione en el primer render, sin JS, para
 * alguien que abre el link desde WhatsApp.
 *
 * No sale nada del dueño: ni su id, ni el id de la lista, ni cuándo la creó.
 * Solo el nombre que le puso y los productos.
 */
export const loader = ({ request, params }: LoaderFunctionArgs) =>
  manejar(async () => {
    const firma = verificarFirmaProxy(new URL(request.url));
    if (!firma.valido) {
      return respuestaLiquid(pagina(t("api.firmaInvalida")), { status: 401 });
    }

    const shop = await buscarShop(firma.shop);
    const lista = shop
      ? await buscarListaCompartida(shop.id, params.token)
      : null;

    if (!lista) {
      // Mismo mensaje para "no existe" y "dejó de estar compartida": no le
      // confirmamos a nadie que un token es válido.
      return respuestaLiquid(pagina(t("pagina.noEncontrada")), {
        status: 404,
        noindex: true,
      });
    }

    const resueltos = await resolverProductos(
      firma.shop,
      lista.items.map((i) => ({
        productId: i.productId,
        variantId: i.variantId,
      })),
    );

    // Se respeta el orden de la lista y se omiten los que ya no se pueden ver.
    // Se busca por producto+variante: dos favoritos del mismo artículo con
    // distinta variante son dos entradas y se muestran las dos.
    const productos = lista.items
      .map((i) => resueltos.get(claveDeItem(i)))
      .filter((p): p is ProductoResuelto => Boolean(p));

    const cuerpo = `
${SCRIPT_NOINDEX}
<div class="lovelist-pagina lovelist-pagina-compartida" data-lovelist-compartida>
  <header class="lovelist-pagina-cabecera">
    <p class="lovelist-pagina-etiqueta" data-lovelist-texto-de="listaCompartida">${escaparLiquid(t("pagina.listaCompartida"))}</p>
    <h1 class="lovelist-pagina-titulo">${escaparLiquid(lista.name)}</h1>
    <p class="lovelist-pagina-nota" data-lovelist-texto-de="soloLectura">${escaparLiquid(t("pagina.soloLectura"))}</p>
  </header>
  ${productos.length ? grilla(productos) : vacia()}
</div>`;

    return respuestaLiquid(cuerpo, { noindex: true });
  });

function pagina(mensaje: string): string {
  return `
${SCRIPT_NOINDEX}
<div class="lovelist-pagina">
  <p class="lovelist-pagina-vacia">${escaparLiquid(mensaje)}</p>
</div>`;
}

function vacia(): string {
  return `<p class="lovelist-pagina-vacia">${escaparLiquid(t("pagina.vacia"))}</p>`;
}

function grilla(productos: ProductoResuelto[]): string {
  const tarjetas = productos.map(tarjeta).join("\n");

  // Sin repetir: dos favoritos distintos pueden terminar apuntando a la misma
  // variante vendible —uno guardado sin elegir variante y otro con esa misma
  // elegida— y mandarla dos veces la agregaría al carrito por duplicado.
  const comprables = [
    ...new Set(
      productos
        .map((p) => p.variantIdParaCarrito)
        .filter((v): v is string => Boolean(v)),
    ),
  ];

  const agregarTodo = comprables.length
    ? `<div class="lovelist-pagina-acciones">
         <button type="button" class="lovelist-boton-principal"
                 data-lovelist-agregar-todo="${escaparLiquid(comprables.join(","))}">
           ${escaparLiquid(t("pagina.agregarTodo"))}
         </button>
       </div>`
    : "";

  return `${agregarTodo}<ul class="lovelist-grilla">${tarjetas}</ul>`;
}

function tarjeta(p: ProductoResuelto): string {
  const imagen = p.imagen
    ? `<img src="${escaparLiquid(p.imagen)}" alt="${escaparLiquid(p.imagenAlt)}" loading="lazy" width="300" height="300">`
    : "";

  const boton = p.variantIdParaCarrito
    ? `<button type="button" class="lovelist-boton-carrito"
               data-lovelist-al-carrito="${escaparLiquid(p.variantIdParaCarrito)}">
         ${escaparLiquid(t("pagina.alCarrito"))}
       </button>`
    : `<span class="lovelist-agotado">${escaparLiquid(t("pagina.agotado"))}</span>`;

  const variante = p.varianteTitulo
    ? `<span class="lovelist-tarjeta-variante">${escaparLiquid(p.varianteTitulo)}</span>`
    : "";

  return `<li class="lovelist-tarjeta">
  <a class="lovelist-tarjeta-imagen" href="${escaparLiquid(p.url)}">${imagen}</a>
  <div class="lovelist-tarjeta-datos">
    <a class="lovelist-tarjeta-titulo" href="${escaparLiquid(p.url)}">${escaparLiquid(p.title)}</a>
    ${variante}
    <span class="lovelist-tarjeta-precio"
          data-lovelist-precio="${escaparLiquid(p.precio)}"
          data-lovelist-moneda="${escaparLiquid(p.moneda)}"></span>
    ${boton}
  </div>
</li>`;
}

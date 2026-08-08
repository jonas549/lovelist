import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";

import {
  ErrorApi,
  autenticarProxy,
  consumirEscritura,
  json,
  manejar,
  obtenerOCrearShop,
} from "../proxy.server";
import { agregarItem, serializarLista } from "../wishlist.server";

export const loader = ({ request }: LoaderFunctionArgs) =>
  manejar(async () => {
    await autenticarProxy(request);
    throw new ErrorApi(405, "metodoNoPermitido");
  });

/**
 * POST /proxy/items — agrega un producto a una lista.
 *
 * Cuerpo: { productId, variantId?, listId?, anonymousId? }
 * Sin `listId` va a la lista predeterminada, creándola si es la primera vez.
 * Si el producto ya estaba, responde 200 sin error (alta idempotente).
 */
export const action = ({ request }: ActionFunctionArgs) =>
  manejar(async () => {
    const { shopDominio, identidad, metodo, cuerpo } =
      await autenticarProxy(request);

    if (metodo !== "POST") throw new ErrorApi(405, "metodoNoPermitido");

    const shop = await obtenerOCrearShop(shopDominio);
    await consumirEscritura(shop.id, identidad);

    const { lista, item, creado } = await agregarItem(
      shop.id,
      identidad,
      cuerpo,
    );

    return json(
      {
        ok: true,
        created: creado,
        item: {
          id: item.id,
          productId: item.productId,
          variantId: item.variantId,
          addedAt: item.addedAt.toISOString(),
        },
        list: {
          id: lista.id,
          name: lista.name,
          isDefault: lista.isDefault,
          shareUrl: serializarLista(lista, shopDominio).shareUrl,
        },
      },
      creado ? 201 : 200,
    );
  });

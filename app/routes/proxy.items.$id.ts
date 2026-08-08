import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";

import {
  ErrorApi,
  autenticarProxy,
  consumirEscritura,
  json,
  manejar,
  obtenerOCrearShop,
} from "../proxy.server";
import { quitarItem } from "../wishlist.server";

export const loader = ({ request }: LoaderFunctionArgs) =>
  manejar(async () => {
    await autenticarProxy(request);
    throw new ErrorApi(405, "metodoNoPermitido");
  });

/**
 * DELETE /proxy/items/:id — quita un item.
 * También acepta POST con `_method: "DELETE"`.
 */
export const action = ({ request, params }: ActionFunctionArgs) =>
  manejar(async () => {
    const { shopDominio, identidad, metodo } = await autenticarProxy(request);

    if (metodo !== "DELETE") throw new ErrorApi(405, "metodoNoPermitido");

    const shop = await obtenerOCrearShop(shopDominio);
    await consumirEscritura(shop.id, identidad);

    const { itemId, listId } = await quitarItem(shop.id, identidad, params.id);
    return json({ ok: true, deletedItemId: itemId, listId });
  });

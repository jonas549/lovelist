import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";

import {
  ErrorApi,
  autenticarProxy,
  autorizarEscritura,
  json,
  manejar,
  obtenerOCrearShop,
} from "../proxy.server";
import { borrarLista, renombrarLista, serializarLista } from "../wishlist.server";

export const loader = ({ request }: LoaderFunctionArgs) =>
  manejar(async () => {
    // Autenticamos igual para no revelar nada por el código de estado.
    await autenticarProxy(request);
    throw new ErrorApi(405, "metodoNoPermitido");
  });

/**
 * PATCH  /proxy/lists/:id — renombra
 * DELETE /proxy/lists/:id — borra (la predeterminada no se puede)
 *
 * También acepta POST con `_method`, por si el App Proxy no reenvía PATCH.
 */
export const action = ({ request, params }: ActionFunctionArgs) =>
  manejar(async () => {
    const { shopDominio, identidad, metodo, cuerpo } =
      await autenticarProxy(request);

    const shop = await obtenerOCrearShop(shopDominio);
    await autorizarEscritura(shop, identidad);

    if (metodo === "PATCH" || metodo === "PUT") {
      const lista = await renombrarLista(
        shop.id,
        identidad,
        params.id,
        cuerpo.name,
      );
      return json({ ok: true, list: serializarLista(lista, shopDominio) });
    }

    if (metodo === "DELETE") {
      const id = await borrarLista(shop.id, identidad, params.id);
      return json({ ok: true, deletedListId: id });
    }

    throw new ErrorApi(405, "metodoNoPermitido");
  });

import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";

import {
  ErrorApi,
  autenticarProxy,
  autorizarEscritura,
  json,
  manejar,
  obtenerOCrearShop,
} from "../proxy.server";
import { compartirLista, serializarLista } from "../wishlist.server";

export const loader = ({ request }: LoaderFunctionArgs) =>
  manejar(async () => {
    await autenticarProxy(request);
    throw new ErrorApi(405, "metodoNoPermitido");
  });

/**
 * POST /proxy/lists/:id/share — genera el shareToken y devuelve la URL pública.
 * Idempotente: si la lista ya se compartió, devuelve el token existente.
 */
export const action = ({ request, params }: ActionFunctionArgs) =>
  manejar(async () => {
    const { shopDominio, identidad, metodo } = await autenticarProxy(request);

    if (metodo !== "POST") throw new ErrorApi(405, "metodoNoPermitido");

    const shop = await obtenerOCrearShop(shopDominio);
    await autorizarEscritura(shop, identidad);

    const lista = await compartirLista(shop.id, identidad, params.id);
    const serializada = serializarLista(lista, shopDominio);

    return json({
      ok: true,
      list: serializada,
      shareUrl: serializada.shareUrl,
    });
  });

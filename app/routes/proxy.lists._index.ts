import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";

import {
  ErrorApi,
  autenticarProxy,
  buscarShop,
  consumirEscritura,
  json,
  manejar,
  obtenerOCrearShop,
} from "../proxy.server";
import { crearLista, listarListas, serializarLista } from "../wishlist.server";

/** GET /proxy/lists — listas del visitante con sus items. No muta nada. */
export const loader = ({ request }: LoaderFunctionArgs) =>
  manejar(async () => {
    const { shopDominio, identidad } = await autenticarProxy(request);

    // Solo lectura: si la tienda todavía no tiene fila, no la creamos acá.
    const shop = await buscarShop(shopDominio);
    if (!shop) return json({ ok: true, lists: [] });

    const listas = await listarListas(shop.id, identidad);
    return json({
      ok: true,
      lists: listas.map((l) => serializarLista(l, shopDominio)),
    });
  });

/** POST /proxy/lists — crea una lista nueva. */
export const action = ({ request }: ActionFunctionArgs) =>
  manejar(async () => {
    const { shopDominio, identidad, metodo, cuerpo } =
      await autenticarProxy(request);

    if (metodo !== "POST") throw new ErrorApi(405, "metodoNoPermitido");

    const shop = await obtenerOCrearShop(shopDominio);
    await consumirEscritura(shop.id, identidad);

    const lista = await crearLista(shop.id, identidad, cuerpo.name);
    return json({ ok: true, list: serializarLista(lista, shopDominio) }, 201);
  });

import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";

import {
  ErrorApi,
  autenticarProxy,
  buscarShop,
  json,
  manejar,
} from "../proxy.server";
import { resolverProductos } from "../productos.server";
import { listarListas } from "../wishlist.server";

export const loader = ({ request }: LoaderFunctionArgs) =>
  manejar(async () => {
    await autenticarProxy(request);
    throw new ErrorApi(405, "metodoNoPermitido");
  });

/**
 * POST /proxy/products — datos de los productos que el visitante tiene guardados.
 *
 * No recibe qué productos pedir: se resuelven los de SUS listas. Aceptar una
 * lista de IDs del cliente convertiría esto en un lector de catálogo para
 * cualquiera que sepa firmar una petición del proxy.
 *
 * Es POST y no GET porque los invitados mandan su anonymousId en el cuerpo,
 * pero no muta nada.
 */
export const action = ({ request }: ActionFunctionArgs) =>
  manejar(async () => {
    const { shopDominio, identidad, metodo } = await autenticarProxy(request);
    if (metodo !== "POST") throw new ErrorApi(405, "metodoNoPermitido");

    const shop = await buscarShop(shopDominio);
    if (!shop) return json({ ok: true, products: [] });

    const listas = await listarListas(shop.id, identidad);
    const referencias = listas.flatMap((l) =>
      l.items.map((i) => ({ productId: i.productId, variantId: i.variantId })),
    );

    const resueltos = await resolverProductos(shopDominio, referencias);

    return json({ ok: true, products: [...resueltos.values()] });
  });

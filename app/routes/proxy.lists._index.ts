import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";

import {
  ErrorApi,
  anotarActividadDelEmbed,
  autenticarProxy,
  buscarShop,
  autorizarEscritura,
  json,
  manejar,
  obtenerOCrearShop,
} from "../proxy.server";
import { tienePlanActivo } from "../plan.server";
import { crearLista, listarListas, serializarLista } from "../wishlist.server";

/** GET /proxy/lists — listas del visitante con sus items. No muta nada. */
export const loader = ({ request }: LoaderFunctionArgs) =>
  manejar(async () => {
    const { shopDominio, identidad } = await autenticarProxy(request);

    // Solo lectura: si la tienda todavía no tiene fila, no la creamos acá.
    const shop = await buscarShop(shopDominio);
    if (!shop) return json({ ok: true, activo: false, lists: [] });

    // Esta llamada la hace el app embed en CADA carga de página del
    // storefront, así que es la señal más fiable de que está activo. Es lo que
    // le permite al dashboard mostrar el estado real sin pedir `read_themes`.
    await anotarActividadDelEmbed(shop);

    const listas = await listarListas(shop.id, identidad);

    // `activo` le dice al storefront si esta tienda puede guardar favoritos.
    // Las listas se devuelven igual: sin plan se sigue viendo lo guardado, y
    // vuelve entero si la tienda se resuscribe. No se borra nada nunca.
    return json({
      ok: true,
      activo: tienePlanActivo(shop),
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
    await autorizarEscritura(shop, identidad);

    const lista = await crearLista(shop.id, identidad, cuerpo.name);
    return json({ ok: true, list: serializarLista(lista, shopDominio) }, 201);
  });

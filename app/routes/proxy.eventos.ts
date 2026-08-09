import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";

import {
  ErrorApi,
  autenticarProxy,
  autorizarEscritura,
  json,
  manejar,
  obtenerOCrearShop,
} from "../proxy.server";
import { registrarAgregadoAlCarrito } from "../metricas.server";

export const loader = ({ request }: LoaderFunctionArgs) =>
  manejar(async () => {
    await autenticarProxy(request);
    throw new ErrorApi(405, "metodoNoPermitido");
  });

/**
 * POST /proxy/eventos — el comprador agregó al carrito desde Lovelist.
 *
 * Es la única métrica que le muestra al merchant que la app le mueve algo. NO
 * es una conversión: no sabemos si la compra se concretó, y saberlo pediría
 * datos de pedidos, que son Protected Customer Data. En el dashboard se llama
 * "Agregados al carrito desde Lovelist" y en ningún lado se la llama de otra
 * forma.
 *
 * No se guarda quién: solo qué producto y cuándo.
 *
 * Pasa por el mismo tope de escrituras que el resto. Sin eso, un script podría
 * inflar la tabla —y la métrica— indefinidamente.
 */
export const action = ({ request }: ActionFunctionArgs) =>
  manejar(async () => {
    const { shopDominio, identidad, metodo, cuerpo } =
      await autenticarProxy(request);
    if (metodo !== "POST") throw new ErrorApi(405, "metodoNoPermitido");

    const variantes = Array.isArray(cuerpo.variantIds) ? cuerpo.variantIds : [];
    if (!variantes.length) return json({ ok: true, registrados: 0 });

    const shop = await obtenerOCrearShop(shopDominio);
    await autorizarEscritura(shop, identidad);

    const registrados = await registrarAgregadoAlCarrito(shop.id, variantes);
    return json({ ok: true, registrados }, 201);
  });

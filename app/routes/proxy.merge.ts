import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";

import {
  ErrorApi,
  autenticarProxy,
  autorizarEscritura,
  json,
  manejar,
  obtenerOCrearShop,
} from "../proxy.server";
import { fusionarInvitado } from "../wishlist.server";

export const loader = ({ request }: LoaderFunctionArgs) =>
  manejar(async () => {
    await autenticarProxy(request);
    throw new ErrorApi(405, "metodoNoPermitido");
  });

/**
 * POST /proxy/merge — une las listas de invitado con las del cliente.
 *
 * Cuerpo: { anonymousId }
 *
 * La identidad del cliente NO sale del cuerpo: sale del logged_in_customer_id
 * que inyecta el App Proxy y que va firmado. Del cuerpo solo tomamos el
 * anonymousId, que es un portador que el propio visitante conoce.
 *
 * Consecuencia a tener presente: quien conozca un anonymousId ajeno puede
 * absorber esas listas a su cuenta. Es la misma exposición que ya tiene ese
 * UUID —con él ya se pueden leer y modificar esas listas— y no la empeora.
 */
export const action = ({ request }: ActionFunctionArgs) =>
  manejar(async () => {
    const { shopDominio, identidad, metodo, cuerpo } =
      await autenticarProxy(request);

    if (metodo !== "POST") throw new ErrorApi(405, "metodoNoPermitido");
    if (identidad.tipo !== "cliente") {
      throw new ErrorApi(409, "fusionSinSesion");
    }

    const shop = await obtenerOCrearShop(shopDominio);
    await autorizarEscritura(shop, identidad);

    const resultado = await fusionarInvitado(
      shop.id,
      identidad.customerId,
      cuerpo.anonymousId,
    );

    return json({ ok: true, ...resultado });
  });

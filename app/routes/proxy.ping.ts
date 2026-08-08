import type { LoaderFunctionArgs } from "react-router";

import { ErrorApi, json, manejar, verificarFirmaProxy } from "../proxy.server";

/**
 * GET /apps/lovelist/ping (storefront) -> /proxy/ping (esta app)
 *
 * Comprueba que la tubería del App Proxy funciona. A diferencia del resto de
 * /proxy, NO exige identidad: solo valida la firma. Sirve para diagnosticar el
 * proxy aislado de la lógica de wishlist.
 */
export const loader = ({ request }: LoaderFunctionArgs) =>
  manejar(async () => {
    const firma = verificarFirmaProxy(new URL(request.url));
    if (!firma.valido) throw new ErrorApi(401, "firmaInvalida");

    return json({
      ok: true,
      shop: firma.shop,
      loggedInCustomerId: firma.loggedInCustomerId,
    });
  });

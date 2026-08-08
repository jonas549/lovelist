import type { LoaderFunctionArgs } from "react-router";

import { authenticateProxy } from "../proxy.server";

/**
 * GET /apps/lovelist/ping (storefront) -> /proxy/ping (esta app)
 *
 * Solo sirve para comprobar que la tubería del App Proxy funciona en Vercel.
 * Si la firma no valida, `authenticateProxy` lanza un 401.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { shop, loggedInCustomerId } = authenticateProxy(request);

  return Response.json(
    { ok: true, shop, loggedInCustomerId },
    { headers: { "Cache-Control": "no-store" } },
  );
};

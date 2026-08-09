import type { Shop } from "@prisma/client";

import prisma from "./db.server";

/**
 * Estado de los primeros pasos del merchant.
 *
 * Shopify exige mostrar el estado de configuración en la home de la app, y es
 * además donde se pierden las instalaciones: el merchant instala, no ve nada,
 * y se va.
 */

/**
 * Cuánto vale la última señal del storefront antes de dejar de contarla.
 *
 * Con el embed activo, cada carga de página del storefront nos llama. Si en
 * dos días no vimos ninguna, o el merchant lo apagó o su tienda no tiene
 * visitas. **No sabemos cuál de las dos**, y por eso el texto nunca afirma que
 * esté apagado: dice que no detectamos actividad. Acusar de algo que no
 * podemos comprobar es peor que no informar.
 */
const VIGENCIA_MS = 2 * 24 * 60 * 60 * 1000;

export type EstadoPrimerosPasos = {
  embedDetectado: boolean;
  embedVistoAt: string | null;
  botonConfirmado: boolean;
  completo: boolean;
};

type Ajustes = { botonProductoConfirmado?: boolean };

function ajustesDe(shop: Pick<Shop, "settings">): Ajustes {
  const s = shop.settings;
  return s && typeof s === "object" && !Array.isArray(s) ? (s as Ajustes) : {};
}

export function estadoPrimerosPasos(
  shop: Pick<Shop, "settings" | "embedVistoAt"> | null,
): EstadoPrimerosPasos {
  if (!shop) {
    return {
      embedDetectado: false,
      embedVistoAt: null,
      botonConfirmado: false,
      completo: false,
    };
  }

  const visto = shop.embedVistoAt;
  const detectado = Boolean(visto && Date.now() - visto.getTime() < VIGENCIA_MS);
  const botonConfirmado = ajustesDe(shop).botonProductoConfirmado === true;

  return {
    embedDetectado: detectado,
    embedVistoAt: visto ? visto.toISOString() : null,
    botonConfirmado,
    completo: detectado && botonConfirmado,
  };
}

/**
 * Lo que el merchant declara sobre el bloque de la página de producto.
 *
 * Es una casilla y no una detección porque leer el tema pediría el scope
 * `read_themes`, y no vale un permiso más en la pantalla de instalación por
 * una comodidad nuestra. La pantalla dice claramente que no lo verificamos.
 *
 * Se hace merge con lo que hubiera en `settings` para no pisar nada: esa
 * columna es de uso general.
 */
export async function confirmarBotonProducto(
  shopId: string,
  confirmado: boolean,
): Promise<void> {
  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
    select: { settings: true },
  });

  await prisma.shop.update({
    where: { id: shopId },
    data: {
      settings: {
        ...ajustesDe({ settings: shop?.settings ?? null }),
        botonProductoConfirmado: confirmado,
      },
    },
  });
}

/**
 * Deep links al editor de temas.
 *
 * El formato lo define Shopify y necesita el `client_id` de la app más el
 * nombre del archivo del bloque, sin extensión.
 */
export function enlacesDelEditor(shopDominio: string, apiKey: string) {
  const base = `https://${shopDominio}/admin/themes/current/editor`;
  return {
    embed: `${base}?context=apps&template=index&activateAppId=${apiKey}/lovelist-embed`,
    boton: `${base}?template=product&addAppBlockId=${apiKey}/lovelist-boton&target=mainSection`,
  };
}

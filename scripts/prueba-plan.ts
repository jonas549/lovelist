/**
 * Prueba del camino del dinero contra la base de datos real.
 *
 * Existe por el fallo del 2026-08-18: en una tienda recién instalada no había
 * fila `Shop` —sólo la creaban las escrituras del storefront—, todo el admin
 * guardaba con `if (shop)`, y el resultado era que a quien acababa de pagar se
 * le decía "todavía no vemos tu suscripción" **sin haberle preguntado nunca a
 * Shopify**. El botón de reintentar recorría el mismo camino nulo, así que no
 * había salida. Es el caso de una instalación nueva, o sea el del revisor.
 *
 * Ni el banco de pruebas ni `test:limite` podían agarrarlo: el banco simula al
 * navegador y no conoce el admin, y `test:limite` arranca creando la fila que
 * acá es justamente la que no existe.
 *
 * Lo que se comprueba es la mitad determinista —que la fila se asegure y que
 * los tres estados de la confirmación se distingan—. La otra mitad, que Shopify
 * devuelva la suscripción, se recorre en la tienda real: eso no se simula.
 *
 * Se corre con:  npm run test:plan
 *
 * Usa una tienda de mentira con dominio propio y la borra al terminar.
 */
import prisma from "../app/db.server";
import { obtenerShopDelAdmin } from "../app/proxy.server";
import type { LecturaDeSuscripcion } from "../app/plan.server";

// `plan.server` arrastra `shopify.server`, que llama a `shopifyApp()` al
// cargarse y exige `SHOPIFY_APP_URL`. En producción está; en el `.env` local no
// hace falta para nada más, así que se le da el valor real antes de importar.
// Tiene que ser import dinámico: los estáticos se resuelven antes que esto.
process.env.SHOPIFY_APP_URL ||= "https://lovelist-bay.vercel.app";

const {
  HANDLE_GRATIS,
  HANDLE_PAGO,
  LIMITE_ITEMS_FREE,
  LIMITE_ITEMS_PRO,
  PLAN_PAGO,
  PLAN_SIN_SUSCRIPCION,
  esHandleGratuito,
  estadoDeConfirmacion,
  limiteItemsPorLista,
} = await import("../app/plan.server");

let fallos = 0;
function ok(nombre: string, cond: boolean, extra?: string) {
  if (!cond) fallos++;
  console.log((cond ? "PASS  " : "FALLO ") + nombre + (extra ? "   <- " + extra : ""));
}

const DOMINIO = "prueba-plan.myshopify.test";

async function main() {
  // Estado inicial limpio, y acá no es una formalidad: la tienda SIN fila es
  // exactamente la condición que reproduce el fallo.
  await prisma.shop.deleteMany({ where: { domain: DOMINIO } });

  try {
    const antes = await prisma.shop.findUnique({ where: { domain: DOMINIO } });
    ok("se parte de una tienda sin fila", antes === null, antes ? "quedó una fila" : "");

    // --- 1. El admin asegura la fila -------------------------------------
    const creada = await obtenerShopDelAdmin(DOMINIO);
    ok("una tienda recién instalada obtiene su fila", Boolean(creada?.id));
    ok(
      "y nace en el plan gratuito",
      creada.plan === PLAN_SIN_SUSCRIPCION,
      `plan=${creada.plan}`,
    );
    ok(
      `con el límite del gratuito (${LIMITE_ITEMS_FREE})`,
      limiteItemsPorLista(creada) === LIMITE_ITEMS_FREE,
      `límite=${limiteItemsPorLista(creada)}`,
    );

    // --- 2. Idempotencia --------------------------------------------------
    const otraVez = await obtenerShopDelAdmin(DOMINIO);
    ok("la segunda carga del admin devuelve la misma fila", otraVez.id === creada.id);
    const cuantas = await prisma.shop.count({ where: { domain: DOMINIO } });
    ok("y no duplica filas", cuantas === 1, `hay ${cuantas}`);

    // --- 3. Reinstalación: la marca vieja se limpia ------------------------
    await prisma.shop.update({
      where: { id: creada.id },
      data: { uninstalledAt: new Date() },
    });
    const reinstalada = await obtenerShopDelAdmin(DOMINIO);
    ok(
      "una marca de desinstalación vieja se limpia al volver al admin",
      reinstalada.uninstalledAt === null,
      `uninstalledAt=${reinstalada.uninstalledAt}`,
    );

    // --- 4. Los tres estados de la confirmación ---------------------------
    //
    // El fallo del 2026-08-18 se veía acá: el estado caía en "sinConfirmar"
    // por falta de fila, no por falta de respuesta de Shopify. Ahora el único
    // camino a "sinConfirmar" es que Shopify no haya contestado.
    const leePro: LecturaDeSuscripcion = { estado: "confirmado", handle: HANDLE_PAGO };
    const leeGratis: LecturaDeSuscripcion = { estado: "confirmado", handle: HANDLE_GRATIS };
    const leeNada: LecturaDeSuscripcion = { estado: "confirmado", handle: null };
    const noSabe: LecturaDeSuscripcion = { estado: "desconocido", motivo: "fallo de red" };

    const pagando = await prisma.shop.update({
      where: { id: creada.id },
      data: { plan: PLAN_PAGO, planActivatedAt: new Date() },
    });

    ok(
      "suscripción a Pro confirmada -> estado pro",
      estadoDeConfirmacion(pagando, leePro) === "pro",
      estadoDeConfirmacion(pagando, leePro),
    );
    ok(
      `y el límite sube a ${LIMITE_ITEMS_PRO}`,
      limiteItemsPorLista(pagando) === LIMITE_ITEMS_PRO,
      `límite=${limiteItemsPorLista(pagando)}`,
    );

    const gratuita = await prisma.shop.update({
      where: { id: creada.id },
      data: { plan: PLAN_SIN_SUSCRIPCION, planActivatedAt: null },
    });

    // Elegir Gratis NO es un fallo de confirmación: la vimos y es la que pidió.
    ok(
      "elegir el plan gratuito -> estado gratis, no sinConfirmar",
      estadoDeConfirmacion(gratuita, leeGratis) === "gratis",
      estadoDeConfirmacion(gratuita, leeGratis),
    );
    ok(
      "sin ninguna suscripción -> estado gratis",
      estadoDeConfirmacion(gratuita, leeNada) === "gratis",
      estadoDeConfirmacion(gratuita, leeNada),
    );
    ok(
      "y el límite vuelve al del gratuito",
      limiteItemsPorLista(gratuita) === LIMITE_ITEMS_FREE,
      `límite=${limiteItemsPorLista(gratuita)}`,
    );

    // El único caso legítimo de "no sé": Shopify no contestó.
    ok(
      "Shopify sin contestar -> sinConfirmar (y sólo ese caso)",
      estadoDeConfirmacion(gratuita, noSabe) === "sinConfirmar",
      estadoDeConfirmacion(gratuita, noSabe),
    );

    // --- 5. La baja de Pro a gratis ---------------------------------------
    //
    // Los dos handles que significan "esta tienda no paga". Sin esto la baja
    // no se refleja nunca y el merchant conserva el límite pagado para siempre.
    ok("el handle gratuito cuenta como no-paga", esHandleGratuito(HANDLE_GRATIS));
    ok("y la ausencia de suscripción también", esHandleGratuito(null));
    ok("el handle de pago NO", !esHandleGratuito(HANDLE_PAGO));
  } finally {
    await prisma.shop.deleteMany({ where: { domain: DOMINIO } });
    await prisma.$disconnect();
  }

  console.log(fallos === 0 ? "\nTODO OK" : `\n${fallos} FALLOS`);
  process.exit(fallos === 0 ? 0 : 1);
}

await main();

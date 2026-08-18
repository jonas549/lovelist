/**
 * Diagnóstico de solo lectura del camino del dinero.
 *
 * Pregunta, con el MISMO token que usa la app en produccion, que devuelve hoy
 * `currentAppInstallation.activeSubscriptions` con Shopify App Pricing
 * habilitado. No escribe nada, ni en la base ni en Shopify.
 *
 * Uso:
 *   node --env-file=.env scripts/diagnostico-suscripcion.mjs <tienda.myshopify.com>
 */

import { PrismaClient } from "@prisma/client";

const tienda = process.argv[2];
if (!tienda) {
  console.error("Falta el dominio de la tienda.");
  process.exit(1);
}

// La app corre en July26; el toml de webhooks dice 2026-10. Se prueban las dos
// por si el campo depende de la version.
const VERSIONES = ["2026-07", "2026-10"];

const prisma = new PrismaClient();

function linea(t) {
  console.log("\n" + "=".repeat(70) + "\n" + t + "\n" + "=".repeat(70));
}

async function consultar(version, token, query, variables) {
  const r = await fetch(`https://${tienda}/admin/api/${version}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token,
    },
    body: JSON.stringify({ query, variables }),
  });
  const texto = await r.text();
  let cuerpo;
  try {
    cuerpo = JSON.parse(texto);
  } catch {
    cuerpo = { _noEsJson: texto.slice(0, 500) };
  }
  return { status: r.status, cuerpo };
}

// La consulta EXACTA que corre hoy en produccion (app/plan.server.ts).
const CONSULTA_PRODUCCION = `
  query lovelistSuscripcion {
    currentAppInstallation {
      activeSubscriptions {
        status
        lineItems {
          plan {
            pricingDetails {
              __typename
              ... on AppRecurringPricing {
                planHandle
              }
            }
          }
        }
      }
    }
  }
`;

// Volcado ancho: todo lo que la instalacion sepa decir, sin asumir la forma.
const CONSULTA_ANCHA = `
  query volcado {
    currentAppInstallation {
      id
      launchUrl
      activeSubscriptions {
        id
        name
        status
        test
        createdAt
        currentPeriodEnd
        lineItems {
          id
          plan {
            pricingDetails {
              __typename
              ... on AppRecurringPricing {
                interval
                price { amount currencyCode }
              }
              ... on AppUsagePricing {
                terms
                balanceUsed { amount currencyCode }
              }
            }
          }
        }
      }
      allSubscriptions(first: 10) {
        edges {
          node { id name status createdAt test }
        }
      }
    }
  }
`;

const INTROSPECCION = `
  query introspeccion {
    recurring: __type(name: "AppRecurringPricing") {
      kind
      fields { name }
    }
    detalles: __type(name: "AppPricingDetails") {
      kind
      possibleTypes { name }
    }
    suscripcion: __type(name: "AppSubscription") {
      fields { name }
    }
  }
`;

async function main() {
  linea(`TIENDA: ${tienda}`);

  const sesiones = await prisma.session.findMany({ where: { shop: tienda } });
  if (!sesiones.length) {
    console.error(
      `No hay ninguna sesion para ${tienda} en la base. ` +
        `O la app no esta instalada ahi, o el .env apunta a otra base.`,
    );
    const otras = await prisma.session.findMany({ select: { shop: true, isOnline: true } });
    console.error("Sesiones que si existen:", otras);
    await prisma.$disconnect();
    process.exit(1);
  }

  const offline = sesiones.filter((s) => !s.isOnline);
  console.log(`sesiones totales: ${sesiones.length} (offline: ${offline.length})`);
  for (const s of sesiones) {
    console.log({
      id: s.id,
      isOnline: s.isOnline,
      scope: s.scope,
      expires: s.expires,
      refreshTokenExpires: s.refreshTokenExpires,
      tokenPresente: Boolean(s.accessToken),
      tokenVencido: s.expires ? s.expires.getTime() < Date.now() : null,
    });
  }

  const sesion = offline[0] ?? sesiones[0];
  if (!sesion?.accessToken) {
    console.error("La sesion no tiene accessToken.");
    await prisma.$disconnect();
    process.exit(1);
  }

  const shop = await prisma.shop.findUnique({ where: { domain: tienda } });
  linea("FILA Shop EN LA BASE");
  console.log(
    shop
      ? {
          plan: shop.plan,
          planActivatedAt: shop.planActivatedAt,
          planRevisadoAt: shop.planRevisadoAt,
        }
      : "no hay fila Shop para esta tienda",
  );

  for (const version of VERSIONES) {
    linea(`API ${version} — introspeccion del tipo`);
    const intro = await consultar(version, sesion.accessToken, INTROSPECCION);
    console.log(`HTTP ${intro.status}`);
    console.log(JSON.stringify(intro.cuerpo, null, 2));

    linea(`API ${version} — CONSULTA DE PRODUCCION (la que corre hoy)`);
    const prod = await consultar(version, sesion.accessToken, CONSULTA_PRODUCCION);
    console.log(`HTTP ${prod.status}`);
    console.log(JSON.stringify(prod.cuerpo, null, 2));

    linea(`API ${version} — VOLCADO ANCHO`);
    const ancho = await consultar(version, sesion.accessToken, CONSULTA_ANCHA);
    console.log(`HTTP ${ancho.status}`);
    console.log(JSON.stringify(ancho.cuerpo, null, 2));
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});

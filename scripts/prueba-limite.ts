/**
 * Prueba del límite de productos por lista, contra la base de datos real.
 *
 * No vive en el banco de pruebas porque el banco simula al navegador, y el
 * navegador nunca manda un alta de algo que ya tiene guardado. El caso que
 * importa acá sólo existe del lado del servidor: dos pestañas abiertas, un
 * reintento tras un fallo de red, o una lista que quedó por encima del límite
 * porque la tienda bajó de plan.
 *
 * Se corre con:  npm run test:limite
 *
 * Usa una tienda de mentira con un dominio propio y la borra al terminar, así
 * que se puede correr contra la base de desarrollo sin ensuciar nada.
 */
import prisma from "../app/db.server";
import { agregarItem } from "../app/wishlist.server";
import { ErrorApi, type Identidad } from "../app/proxy.server";

let fallos = 0;
function ok(nombre: string, cond: boolean, extra?: string) {
  if (!cond) fallos++;
  console.log((cond ? "PASS  " : "FALLO ") + nombre + (extra ? "   <- " + extra : ""));
}

const DOMINIO = "prueba-limite.myshopify.test";
const ANON = "99999999-2222-4333-8444-555555555555";
const LIMITE = 3;

const gid = (n: number) => `gid://shopify/Product/${n}`;

async function main() {
  const shop = await prisma.shop.upsert({
    where: { domain: DOMINIO },
    update: {},
    create: { domain: DOMINIO },
  });

  // Estado inicial limpio. Sin esto, lo que dejó la corrida anterior decide el
  // resultado de ésta: es el error que ya nos costó una entrega.
  await prisma.wishlist.deleteMany({ where: { shopId: shop.id } });

  const identidad: Identidad = { tipo: "invitado", anonymousId: ANON };

  try {
    for (let i = 1; i <= LIMITE; i++) {
      await agregarItem(shop.id, identidad, { productId: gid(1000 + i) }, LIMITE);
    }

    const lista = await prisma.wishlist.findFirstOrThrow({ where: { shopId: shop.id } });
    const cuantos = await prisma.wishlistItem.count({ where: { wishlistId: lista.id } });
    ok(`entran los primeros ${LIMITE}`, cuantos === LIMITE, `hay ${cuantos}`);

    // Uno nuevo con la lista llena: tiene que rebotar, y con el código que el
    // storefront sabe traducir al texto del merchant.
    let err: unknown = null;
    try {
      await agregarItem(shop.id, identidad, { productId: gid(2000) }, LIMITE);
    } catch (e) {
      err = e;
    }
    const esLlena = err instanceof ErrorApi && err.codigo === "listaLlena" && err.status === 409;
    ok("el siguiente rebota con listaLlena/409", esLlena,
       err instanceof ErrorApi ? `${err.codigo}/${err.status}` : String(err));

    // Y el que YA está guardado NO puede rebotar: el comprador no está
    // agregando nada. Decirle "tu lista está llena" por algo que ya tiene es
    // mentirle, y encima lo deja sin saber qué hacer.
    let err2: unknown = null;
    let res2: Awaited<ReturnType<typeof agregarItem>> | null = null;
    try {
      res2 = await agregarItem(shop.id, identidad, { productId: gid(1001) }, LIMITE);
    } catch (e) {
      err2 = e;
    }
    ok("re-guardar uno que YA está no rebota", !err2,
       err2 instanceof ErrorApi ? err2.codigo : String(err2 ?? ""));
    ok("y lo devuelve como no-creado", res2?.creado === false,
       res2 ? `creado=${res2.creado}` : "sin respuesta");

    // Nada de lo anterior pudo agregar filas de más ni llevarse puesto nada.
    const final = await prisma.wishlistItem.count({ where: { wishlistId: lista.id } });
    ok(`la lista sigue con ${LIMITE} items`, final === LIMITE, `hay ${final}`);

    // Por encima del límite —como queda quien baja de Pro a Gratis— nada se
    // borra y todo se puede seguir quitando.
    await prisma.wishlistItem.createMany({
      data: [gid(3001), gid(3002)].map((productId) => ({
        wishlistId: lista.id,
        productId,
        variantId: null,
      })),
    });
    const porEncima = await prisma.wishlistItem.count({ where: { wishlistId: lista.id } });
    ok("una lista por encima del límite conserva todo", porEncima === LIMITE + 2, `hay ${porEncima}`);

    const uno = await prisma.wishlistItem.findFirstOrThrow({ where: { wishlistId: lista.id } });
    await prisma.wishlistItem.delete({ where: { id: uno.id } });
    const tras = await prisma.wishlistItem.count({ where: { wishlistId: lista.id } });
    ok("y se puede quitar estando por encima del límite", tras === LIMITE + 1, `hay ${tras}`);
  } finally {
    await prisma.wishlist.deleteMany({ where: { shopId: shop.id } });
    await prisma.shop.delete({ where: { id: shop.id } }).catch(() => {});
    await prisma.$disconnect();
  }

  console.log(fallos === 0 ? "\nTODO OK" : `\n${fallos} FALLOS`);
  process.exit(fallos === 0 ? 0 : 1);
}

await main();

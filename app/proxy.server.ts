import crypto from "node:crypto";

import prisma from "./db.server";
import { t } from "./i18n";

/**
 * Tolerancia de reloj para el parámetro `timestamp`, en segundos.
 * Mismo valor que usa @shopify/shopify-api internamente. Evita replays.
 */
const TOLERANCIA_TIMESTAMP_SEG = 90;

/** Debe coincidir con [app_proxy] prefix/subpath de shopify.app.toml. */
export const RUTA_PROXY_PUBLICA = "/apps/lovelist";

export const LIMITES = {
  /** Escrituras por identidad y por ventana. */
  escriturasPorVentana: 60,
  ventanaSegundos: 60,
  listasPorIdentidad: 20,
  itemsPorLista: 200,
  largoNombreLista: 60,
} as const;

// ---------------------------------------------------------------------------
// Firma del App Proxy
// ---------------------------------------------------------------------------

export type MotivoRechazo =
  | "sin_firma"
  | "firma_invalida"
  | "timestamp_fuera_de_rango";

export type ResultadoProxy =
  | { valido: true; shop: string; loggedInCustomerId: string | null }
  | { valido: false; motivo: MotivoRechazo };

/**
 * Validación de la firma del App Proxy de Shopify.
 *
 * Shopify agrega a la query string un parámetro `signature`. Para verificarlo:
 *   1. Sacar `signature` de los parámetros.
 *   2. Armar "clave=valor" para cada uno; si una clave se repite, unir sus
 *      valores con coma.
 *   3. Ordenar alfabéticamente por clave.
 *   4. Concatenar esas cadenas SIN separador.
 *   5. HMAC-SHA256 con el client secret de la app, en hex.
 *   6. Comparar en tiempo constante contra `signature`.
 *
 * Ojo: NO es lo mismo que la firma de los webhooks (base64 sobre el body) ni la
 * del OAuth (`hmac`, con `&` como separador).
 *
 * Doc: https://shopify.dev/docs/apps/build/online-store/display-dynamic-data
 */
export function verificarFirmaProxy(
  url: URL,
  secret = process.env.SHOPIFY_API_SECRET ?? "",
): ResultadoProxy {
  const signature = url.searchParams.get("signature");
  if (!signature || !secret) {
    return { valido: false, motivo: "sin_firma" };
  }

  const timestamp = Number(url.searchParams.get("timestamp"));
  const ahora = Math.trunc(Date.now() / 1000);
  if (
    !Number.isFinite(timestamp) ||
    Math.abs(ahora - timestamp) > TOLERANCIA_TIMESTAMP_SEG
  ) {
    return { valido: false, motivo: "timestamp_fuera_de_rango" };
  }

  const porClave = new Map<string, string[]>();
  for (const [clave, valor] of url.searchParams.entries()) {
    if (clave === "signature") continue;
    const existentes = porClave.get(clave);
    if (existentes) {
      existentes.push(valor);
    } else {
      porClave.set(clave, [valor]);
    }
  }

  const mensaje = [...porClave.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([clave, valores]) => `${clave}=${valores.join(",")}`)
    .join("");

  const esperado = crypto
    .createHmac("sha256", secret)
    .update(mensaje, "utf8")
    .digest("hex");

  const a = Buffer.from(esperado, "utf8");
  const b = Buffer.from(signature, "utf8");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { valido: false, motivo: "firma_invalida" };
  }

  const loggedInCustomerId = url.searchParams.get("logged_in_customer_id");

  return {
    valido: true,
    shop: url.searchParams.get("shop") ?? "",
    loggedInCustomerId: loggedInCustomerId || null,
  };
}

// ---------------------------------------------------------------------------
// Respuestas
// ---------------------------------------------------------------------------

type ClaveError = keyof typeof import("./i18n").es.api;

/** Error de API que se convierte en una Response JSON con mensaje en español. */
export class ErrorApi extends Error {
  readonly status: number;
  readonly codigo: ClaveError;

  constructor(status: number, codigo: ClaveError) {
    super(codigo);
    this.status = status;
    this.codigo = codigo;
    this.name = "ErrorApi";
  }

  aResponse(): Response {
    return json(
      { ok: false, code: this.codigo, message: t(`api.${this.codigo}`) },
      this.status,
    );
  }
}

export function json(cuerpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      // Las respuestas dependen de la identidad del visitante: nunca cachear.
      "Cache-Control": "no-store",
    },
  });
}

/**
 * Envuelve un handler del proxy para que cualquier ErrorApi salga como JSON en
 * español y cualquier otra excepción salga como 500 sin filtrar detalles.
 * Nada de `catch` que solo hace console.error y sigue.
 */
export async function manejar(
  fn: () => Promise<Response>,
): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ErrorApi) return e.aResponse();
    if (e instanceof Response) return e;
    console.error("[proxy] error no controlado", e);
    return new ErrorApi(500, "errorInterno").aResponse();
  }
}

// ---------------------------------------------------------------------------
// Contexto del request
// ---------------------------------------------------------------------------

export type Identidad =
  | { tipo: "cliente"; customerId: string }
  | { tipo: "invitado"; anonymousId: string };

export type ContextoProxy = {
  shopDominio: string;
  identidad: Identidad;
  metodo: string;
  cuerpo: Record<string, unknown>;
};

/** Forma de UUID (RFC 4122). No exigimos la versión: alcanza con acotar la clave. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function esUuid(valor: unknown): valor is string {
  return typeof valor === "string" && UUID.test(valor);
}

async function leerCuerpo(request: Request): Promise<Record<string, unknown>> {
  if (request.method === "GET" || request.method === "HEAD") return {};
  const crudo = await request.text();
  if (!crudo.trim()) return {};
  try {
    const parseado: unknown = JSON.parse(crudo);
    if (!parseado || typeof parseado !== "object" || Array.isArray(parseado)) {
      throw new ErrorApi(400, "cuerpoInvalido");
    }
    return parseado as Record<string, unknown>;
  } catch (e) {
    if (e instanceof ErrorApi) throw e;
    throw new ErrorApi(400, "cuerpoInvalido");
  }
}

/**
 * Método real de la petición.
 *
 * La doc de Shopify no dice qué métodos reenvía el App Proxy. GET y POST son
 * seguros; de PATCH no encontramos confirmación. Por eso aceptamos también
 * POST con `_method` en el cuerpo, para poder cambiar de estrategia en el
 * storefront sin tocar el servidor.
 */
function metodoEfectivo(
  request: Request,
  cuerpo: Record<string, unknown>,
): string {
  const metodo = request.method.toUpperCase();
  if (metodo !== "POST") return metodo;
  const override = cuerpo._method;
  if (typeof override === "string") {
    const normalizado = override.toUpperCase();
    if (["PATCH", "PUT", "DELETE"].includes(normalizado)) return normalizado;
  }
  return metodo;
}

function resolverIdentidad(
  url: URL,
  loggedInCustomerId: string | null,
  cuerpo: Record<string, unknown>,
): Identidad {
  if (loggedInCustomerId) {
    return { tipo: "cliente", customerId: loggedInCustomerId };
  }

  // Los GET no llevan cuerpo, así que el invitado se identifica por query.
  const delCuerpo = cuerpo.anonymousId;
  const crudo =
    typeof delCuerpo === "string" && delCuerpo
      ? delCuerpo
      : url.searchParams.get("anonymousId");

  if (!crudo) throw new ErrorApi(400, "identidadFaltante");
  if (!UUID.test(crudo)) throw new ErrorApi(400, "identidadInvalida");

  return { tipo: "invitado", anonymousId: crudo.toLowerCase() };
}

/**
 * Valida la firma, resuelve identidad y método. Lanza ErrorApi si algo falla.
 *
 * `logged_in_customer_id` lo inyecta Shopify cuando hay un cliente con sesión
 * iniciada en el storefront; va vacío si el visitante es anónimo. Por eso NO
 * necesitamos el scope read_customers para identificar al cliente.
 *
 * Nota de seguridad: el `anonymousId` lo genera y envía el propio cliente, así
 * que es un portador (bearer). La firma del proxy prueba que la petición pasó
 * por Shopify, no que quien la manda sea dueño de ese UUID. Es aceptable porque
 * son 122 bits al azar, pero hay que tratarlo como secreto.
 */
export async function autenticarProxy(request: Request): Promise<ContextoProxy> {
  const url = new URL(request.url);
  const firma = verificarFirmaProxy(url);

  if (!firma.valido) {
    throw new ErrorApi(401, "firmaInvalida");
  }

  const cuerpo = await leerCuerpo(request);

  return {
    shopDominio: firma.shop,
    identidad: resolverIdentidad(url, firma.loggedInCustomerId, cuerpo),
    metodo: metodoEfectivo(request, cuerpo),
    cuerpo,
  };
}

// ---------------------------------------------------------------------------
// Tienda y límite de escrituras
// ---------------------------------------------------------------------------

/** Solo lectura: los GET no deben crear nada. */
export function buscarShop(dominio: string) {
  return prisma.shop.findUnique({ where: { domain: dominio } });
}

/** Cada cuánto se refresca la marca de actividad del storefront. */
const VENTANA_EMBED_MS = 60 * 60 * 1000;

/**
 * Anota que el storefront de esta tienda nos habló.
 *
 * Es como el dashboard sabe que el app embed está activo sin pedir el scope
 * `read_themes`: con el embed encendido, cada carga de página del storefront
 * llama a /apps/lovelist/lists.
 *
 * Se escribe como mucho una vez por hora. Sin ese tope sería un UPDATE por
 * cada página que ve cualquier comprador de cualquier tienda, y el rendimiento
 * del storefront es criterio de revisión de Shopify: no vamos a gastarlo en
 * una marca de tiempo.
 *
 * **Se espera el resultado, aunque sea telemetría.** La primera versión lanzaba
 * el UPDATE sin esperarlo, para no sumarle ni un milisegundo a la respuesta.
 * En Vercel eso no funciona: la función se congela apenas responde y la
 * escritura nunca llega a la base. Se comprobó en la tienda real —el evento de
 * carrito, que sí se espera, quedó registrado; esta marca no—. En un entorno
 * sin servidor, lo que no se espera no pasa.
 *
 * El costo real es una escritura por hora y por tienda, que es nada. El error
 * sí se traga: es telemetría para el admin y no puede romperle los favoritos a
 * nadie.
 */
export async function anotarActividadDelEmbed(shop: {
  id: string;
  embedVistoAt: Date | null;
}): Promise<void> {
  const ahora = Date.now();
  if (shop.embedVistoAt && ahora - shop.embedVistoAt.getTime() < VENTANA_EMBED_MS) {
    return;
  }

  try {
    await prisma.shop.update({
      where: { id: shop.id },
      data: { embedVistoAt: new Date(ahora) },
    });
  } catch {
    /* la marca se pierde y se vuelve a intentar en la próxima visita */
  }
}

/**
 * Para escrituras. La Fase 1 creó el modelo Shop pero nada escribía en él.
 *
 * Limpiamos `uninstalledAt` de paso: si el App Proxy sigue entregando
 * peticiones es que la app está instalada, así que una marca vieja de
 * desinstalación sería mentira. El upsert ya hacía un UPDATE: no cuesta nada.
 */
export function obtenerOCrearShop(dominio: string) {
  return prisma.shop.upsert({
    where: { domain: dominio },
    update: { uninstalledAt: null },
    create: { domain: dominio },
  });
}

export function claveIdentidad(identidad: Identidad): string {
  return identidad.tipo === "cliente"
    ? `c:${identidad.customerId}`
    : `a:${identidad.anonymousId}`;
}

/**
 * Ventana fija por identidad, resuelta en un solo statement atómico para que
 * dos instancias de Vercel no puedan pisarse el contador.
 *
 * Limitación conocida: un invitado puede rotar su anonymousId y esquivar esto.
 * Frena el abuso accidental y el scripting ingenuo, no a un atacante decidido.
 */
/**
 * Limpieza oportunista de ventanas vencidas. Sin cron: aprovechamos que ya
 * estamos tocando la tabla.
 *
 * Corre en una fracción de las escrituras y con LIMIT, para que el coste no
 * dependa de cuánta basura se haya acumulado. Si falla, se avisa pero no se
 * rompe la escritura del comprador: limpiar es mantenimiento, no su problema.
 */
const PROBABILIDAD_LIMPIEZA = 0.02;
const MAX_FILAS_POR_LIMPIEZA = 200;

async function limpiarVentanasVencidas(): Promise<void> {
  try {
    await prisma.$executeRaw`
      DELETE FROM "RateLimit"
      WHERE "key" IN (
        SELECT "key" FROM "RateLimit"
        WHERE "windowStart"
              < now() - (${LIMITES.ventanaSegundos}::int * interval '1 second')
        LIMIT ${MAX_FILAS_POR_LIMPIEZA}
      )
    `;
  } catch (e) {
    console.warn("[proxy] no se pudieron limpiar ventanas vencidas", e);
  }
}

export async function consumirEscritura(
  shopId: string,
  identidad: Identidad,
): Promise<void> {
  const clave = `${shopId}:${claveIdentidad(identidad)}`;

  const filas = await prisma.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateLimit" ("key", "windowStart", "count")
    VALUES (${clave}, now(), 1)
    ON CONFLICT ("key") DO UPDATE SET
      "windowStart" = CASE
        WHEN "RateLimit"."windowStart"
             < now() - (${LIMITES.ventanaSegundos}::int * interval '1 second')
        THEN now() ELSE "RateLimit"."windowStart" END,
      "count" = CASE
        WHEN "RateLimit"."windowStart"
             < now() - (${LIMITES.ventanaSegundos}::int * interval '1 second')
        THEN 1 ELSE "RateLimit"."count" + 1 END
    RETURNING "count"
  `;

  const usadas = Number(filas[0]?.count ?? 1);

  if (Math.random() < PROBABILIDAD_LIMPIEZA) {
    await limpiarVentanasVencidas();
  }

  if (usadas > LIMITES.escriturasPorVentana) {
    throw new ErrorApi(429, "demasiadasEscrituras");
  }
}

/** Expuesta solo para poder probar la limpieza sin depender del azar. */
export const _limpiarVentanasVencidas = limpiarVentanasVencidas;

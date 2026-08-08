/**
 * i18n mínimo: un objeto TypeScript plano, sin librería externa.
 * Toda la UI de Lovelist está en español de LATAM.
 *
 * Para agregar textos: escribilos en `es` y usalos con `t("clave")`.
 * Las claves son anidadas y se acceden con notación de punto: t("app.titulo").
 */

export const es = {
  app: {
    nombre: "Lovelist",
    titulo: "Lovelist",
    subtitulo: "Listas de favoritos para tu tienda",
    tiendaConectada: "Tienda conectada",
  },
  comun: {
    cargando: "Cargando…",
    guardar: "Guardar",
    cancelar: "Cancelar",
    errorGenerico: "Ocurrió un error. Intentá de nuevo.",
  },
} as const;

export const locales = { es } as const;

export type Locale = keyof typeof locales;
export const localePorDefecto: Locale = "es";

/** Traducciones tipadas: "app.titulo" | "comun.cargando" | ... */
type Hojas<T, Prefijo extends string = ""> = {
  [K in keyof T & string]: T[K] extends string
    ? `${Prefijo}${K}`
    : Hojas<T[K], `${Prefijo}${K}.`>;
}[keyof T & string];

export type ClaveTraduccion = Hojas<typeof es>;

/**
 * Devuelve el texto para una clave. Si falta, devuelve la clave misma para que
 * el hueco sea evidente en pantalla en vez de romper el render.
 */
export function t(
  clave: ClaveTraduccion,
  locale: Locale = localePorDefecto,
): string {
  const valor = clave
    .split(".")
    .reduce<unknown>(
      (acc, parte) =>
        acc && typeof acc === "object"
          ? (acc as Record<string, unknown>)[parte]
          : undefined,
      locales[locale],
    );

  return typeof valor === "string" ? valor : clave;
}

/** Interpola {variables} en un texto: ti("hola.usuario", { nombre: "Ana" }) */
export function ti(
  clave: ClaveTraduccion,
  variables: Record<string, string | number>,
  locale: Locale = localePorDefecto,
): string {
  return t(clave, locale).replace(/\{(\w+)\}/g, (coincidencia, nombre) =>
    nombre in variables ? String(variables[nombre]) : coincidencia,
  );
}

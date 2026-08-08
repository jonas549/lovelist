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
  wishlist: {
    listaPredeterminada: "Favoritos",
  },
  /** Página de favoritos y vista compartida, servidas por el App Proxy. */
  pagina: {
    vacia: "Esta lista está vacía.",
    vaciaAyuda: "Tocá el corazón en cualquier producto para guardarlo acá.",
    agotado: "Sin stock",
    alCarrito: "Agregar al carrito",
    agregarTodo: "Agregar todo al carrito",
    quitar: "Quitar",
    compartir: "Compartir esta lista",
    copiarLink: "Copiar link",
    copiado: "Link copiado",
    porWhatsapp: "Compartir por WhatsApp",
    porEmail: "Compartir por email",
    mensajeCompartir: "Mirá mi lista de favoritos:",
    asuntoEmail: "Mi lista de favoritos",
    listaCompartida: "Lista compartida",
    soloLectura: "Estás viendo una lista que alguien compartió con vos.",
    noEncontrada: "Este link no existe o dejó de estar disponible.",
    errorCarrito: "No pudimos agregar al carrito. Intentá de nuevo.",
  },
  /** Mensajes que devuelve la API del App Proxy. Los muestra el storefront. */
  api: {
    identidadFaltante:
      "No pudimos identificarte. Recargá la página e intentá de nuevo.",
    identidadInvalida: "El identificador de invitado no es válido.",
    cuerpoInvalido: "La solicitud no tiene el formato esperado.",
    metodoNoPermitido: "Ese método no está permitido en esta dirección.",
    listaNoEncontrada: "No encontramos esa lista.",
    itemNoEncontrado: "No encontramos ese producto en tu lista.",
    nombreRequerido: "La lista necesita un nombre.",
    nombreMuyLargo: "El nombre de la lista es demasiado largo.",
    productoRequerido: "Falta indicar el producto.",
    noSePuedeBorrarPredeterminada: "No podés borrar tu lista de favoritos.",
    fusionSinSesion: "Necesitás iniciar sesión para unir tus favoritos.",
    demasiadasListas: "Llegaste al máximo de listas.",
    listaLlena: "Esta lista llegó al máximo de productos.",
    demasiadasEscrituras:
      "Estás haciendo demasiados cambios muy rápido. Esperá un momento.",
    firmaInvalida: "No pudimos validar la solicitud.",
    errorInterno: "Algo salió mal. Intentá de nuevo.",
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

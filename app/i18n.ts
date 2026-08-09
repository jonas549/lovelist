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
  /**
   * Guía de primeros pasos del dashboard.
   *
   * Está escrita desde lo que gana el merchant, no desde cómo funcionamos por
   * dentro. Una versión anterior explicaba que no podíamos verificar el
   * segundo paso porque no pedimos cierto permiso: al merchant eso no le sirve
   * de nada, y a un revisor de Shopify le suena a app a medio hacer.
   */
  inicio: {
    titulo: "Primeros pasos",
    subtitulo: "Completa estos dos pasos para que Lovelist aparezca en tu tienda.",
    listo: "Listo",
    pendiente: "Pendiente",
    completo: "Todo listo. Lovelist ya está funcionando en tu tienda.",

    embedTitulo: "1. Activar Lovelist en tu tema",
    embedAyuda:
      "Enciende el panel de favoritos, el contador y los corazones en tus páginas de colección.",
    embedBoton: "Activar en el editor de temas",
    embedDetectado: "Detectamos actividad en tu tienda. Última señal: {cuando}.",
    // Nunca afirma que esté apagado: puede estar activo y sin visitas todavía,
    // y no tenemos forma de distinguir una cosa de la otra.
    embedSinDetectar:
      "Todavía no detectamos actividad en tu tienda. Si ya lo activaste, abre tu tienda en otra pestaña y vuelve a comprobar.",
    embedComprobar: "Volver a comprobar",

    botonTitulo: "2. Agregar el botón a la página de producto",
    botonAyuda:
      "Coloca el botón de guardar en la ficha de cada producto, que es donde más se usa. Los corazones de las páginas de colección ya funcionan sin este paso.",
    botonBoton: "Agregar en el editor de temas",
    botonHecho: "Ya agregué el botón a mi página de producto",
  },
  /** Navegación lateral de la app en el admin. */
  nav: {
    inicio: "Inicio",
    configuracion: "Configuración",
    plan: "Plan",
    soporte: "Soporte",
    // Corto a propósito: va en la miga de pan del admin, que tiene poco
    // espacio y trunca. "Volver al inicio" salía cortado como "Volver a…".
    volver: "Inicio",
    ayudaPie: "¿Necesitas ayuda? Escribinos a {correo}.",
  },
  /** Pantalla de configuración. */
  ajustes: {
    titulo: "Configuración",
    intro:
      "La apariencia y los textos de Lovelist se configuran en el editor de temas, junto al resto de tu tienda. Así ves los cambios sobre tu propia tienda antes de publicarlos.",
    abrirEditor: "Abrir el editor de temas",
    donde: "Dónde encontrarlo",
    dondeAyuda:
      "En el editor de temas, abre Configuración → Incrustaciones de aplicaciones → Lovelist. El botón de arriba te lleva directo.",
    queSePuede: "Qué puedes configurar",
    // Sin arreglos: el tipado de claves de este archivo recorre solo objetos y
    // cadenas, y un arreglo le mete los índices y los métodos del Array.
    apariencia: "Apariencia",
    aparienciaIcono:
      "Ícono: corazón o estrella, y si se rellena al guardar o queda en línea.",
    aparienciaColores: "Color del ícono cuando está guardado y cuando no.",
    aparienciaContador: "Mostrar u ocultar el contador del encabezado.",
    aparienciaBotones:
      "Clase CSS de los botones de tu tema, para que los de Lovelist se vean igual.",
    textos: "Textos",
    textosBoton: "Los textos del botón de guardar y del panel de favoritos.",
    textosPagina:
      "Los de la página de favoritos: título, agregar al carrito, quitar.",
    textosCompartir:
      "Los de compartir, incluidos el mensaje y el asunto del email.",
    botonProducto: "Botón de la página de producto",
    botonProductoAyuda:
      "Usa la misma configuración: se agrega una sola vez y hereda el ícono, los colores y los textos.",
  },
  /** Pantalla de planes y cobro. */
  planes: {
    titulo: "Plan",
    heroTitulo: "Activa Lovelist en tu tienda",
    heroTexto:
      "Listas de favoritos para tus compradores: corazones en colecciones y fichas, panel lateral, página de favoritos y listas que se pueden compartir.",
    precio: "US$ 29 por mes",
    precioAyuda:
      "Se cobra junto con tu factura de Shopify. Puedes cancelar cuando quieras desde tu panel de Shopify.",
    elegir: "Elegir plan",
    queIncluye: "Qué incluye",
    inc1: "Corazones en páginas de colección y en la ficha de producto.",
    inc2: "Panel lateral y página de favoritos con el diseño de tu tema.",
    inc3: "Favoritos para quien no tiene cuenta, que se conservan al registrarse.",
    inc4: "Listas que se comparten por enlace, WhatsApp o email.",
    inc5: "Panel con los productos más deseados de tu tienda.",

    activoTitulo: "Tu plan está activo",
    activoTexto: "Lovelist está funcionando en tu tienda.",
    gestionar: "Gestionar el plan en Shopify",

    // Se ve cuando la tienda tuvo plan y ya no lo tiene.
    sinPlanTitulo: "Lovelist está en pausa",
    sinPlanTexto:
      "Los favoritos que tus compradores ya habían guardado siguen guardados y vuelven a estar disponibles apenas actives el plan. No se borra nada.",

    // Nota discreta, no un cartel de error. Es lo primero que ve un revisor de
    // Shopify si entra antes de que el plan esté publicado, y una pantalla en
    // rojo se lee como app rota aunque el motivo sea de configuración.
    faltaHandle:
      "La suscripción se habilita en unos minutos. Si necesitas activarla ahora, escribinos a {correo}.",

    confirmandoTitulo: "Confirmando tu plan",
    confirmadoTitulo: "¡Listo! Tu plan está activo",
    confirmadoTexto: "Ya puedes usar Lovelist en tu tienda.",
    confirmadoIr: "Ir al inicio",
    noConfirmadoTitulo: "Todavía no vemos tu suscripción",
    noConfirmadoTexto:
      "Si acabas de suscribirte, puede tardar unos segundos en registrarse. Vuelve a comprobar; si sigue igual, escribinos.",
    reintentar: "Volver a comprobar",
  },
  /** Pantalla de soporte. */
  soporte: {
    titulo: "Soporte",
    intro: "Escribinos y te respondemos por correo, en español o en inglés.",
    correo: "contacto@appsdeveloperspro.com",
    escribir: "Escribir a soporte",
    respuesta: "Respondemos dentro de los 2 días hábiles.",
    preguntas: "Preguntas frecuentes",

    pInstalar: "¿Cómo instalo Lovelist en mi tienda?",
    rInstalar:
      "Son dos pasos, los dos desde el editor de temas: activar la incrustación de Lovelist y agregar el botón a la página de producto. En Inicio tienes los enlaces directos y el estado de cada uno.",

    pIcono: "¿Cómo cambio el ícono y los colores?",
    rIcono:
      "En el editor de temas, en Configuración → Incrustaciones de aplicaciones → Lovelist. Puedes elegir corazón o estrella, si se rellena al guardar, y los colores para guardado y sin guardar.",

    pTextos: "¿Cómo cambio los textos que ve el comprador?",
    rTextos:
      "En el mismo lugar. Puedes cambiar los textos del botón, del panel, de la página de favoritos y de compartir. Si dejas uno vacío, se usa el texto original.",

    pInvitados: "¿Qué pasa con los favoritos de quien no tiene cuenta?",
    rInvitados:
      "Se guardan igual y siguen ahí si vuelve desde el mismo navegador. Cuando esa persona inicia sesión, sus favoritos se suman a los de su cuenta sin perder nada ni duplicarse.",

    pCompartir: "¿Cómo funciona compartir una lista?",
    rCompartir:
      "Quien tiene la lista genera un enlace desde la página de favoritos. Ese enlace muestra los productos en modo lectura y permite agregarlos al carrito, pero no editar la lista ni ver datos de quien la compartió. Las listas compartidas no aparecen en buscadores.",

    pDatos: "¿Qué datos guarda Lovelist?",
    rDatos:
      "Solo qué productos se guardaron y en qué lista. No guardamos nombre, correo ni dirección de nadie, y los precios e imágenes se leen de tu catálogo en el momento de mostrarlos, así que nunca se muestran desactualizados.",
  },
  /** Métricas del dashboard. */
  metricas: {
    titulo: "Cómo viene Lovelist",
    listas: "Listas de favoritos",
    favoritos: "Productos guardados",
    favoritosUltimos30: "Guardados en los últimos 30 días",
    agregadosAlCarrito: "Agregados al carrito desde Lovelist",
    agregadosAlCarritoAyuda:
      "Cuenta los clics en los botones de carrito de Lovelist. No es una medida de ventas: no sabemos si la compra se completó.",
    ultimos30: "{n} en los últimos 30 días",
    masDeseados: "Los más deseados",
    masDeseadosAyuda: "Los 10 productos que más gente guardó.",
    guardadoPor: "{n} personas",
    guardadoPorUno: "1 persona",
    sinDatos: "Todavía no hay favoritos guardados.",
    sinDatosAyuda:
      "En cuanto alguien guarde su primer producto, vas a ver los números acá.",
    productoNoDisponible: "Producto no disponible",
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
    // El título que ve el COMPRADOR. No es "Lovelist" a propósito: nuestra
    // marca no tiene nada que hacer en la tienda de otro. Tiene que coincidir
    // con el valor por omisión de `texto_tituloPagina` en el app embed, o el
    // título parpadearía al cargar: el servidor pinta este y el JS lo cambia
    // por el del merchant solo si lo personalizó.
    titulo: "Mis favoritos",
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
    // Lo ve el comprador, no el merchant: no puede decir "la tienda no pagó".
    // El storefront además esconde los corazones cuando llega esta señal, así
    // que este mensaje es la última red y casi nunca se ve.
    sinPlanActivo: "Los favoritos no están disponibles en este momento.",
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

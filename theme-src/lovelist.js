/**
 * Lovelist — JavaScript del storefront.
 *
 * Vanilla, sin dependencias. Todo el tráfico va por el App Proxy (/apps/lovelist),
 * nunca al dominio de la app: el tema no debe conocerlo.
 *
 * Regla de oro de este archivo: si algo no se puede hacer, se falla en silencio.
 * Estamos dentro del tema de otra persona y romperle la tienda es peor que no
 * mostrar un corazón.
 */
(function () {
  "use strict";

  if (window.__lovelistCargado) return;
  window.__lovelistCargado = true;

  var RUTA = "/apps/lovelist";
  var LS_ID = "lovelist_anonymous_id";
  var LS_HANDLES = "lovelist_handles";
  var MAX_HANDLES = 300;
  var NIVELES_TARJETA = 6;
  var ANCHO_MINIMO_TARJETA = 80;

  var cfg = leerConfig();
  var T = cfg.textos || {};

  // -------------------------------------------------------------------------
  // Utilidades
  // -------------------------------------------------------------------------

  function todos(sel, raiz) {
    return Array.prototype.slice.call((raiz || document).querySelectorAll(sel));
  }

  function leerConfig() {
    var el = document.getElementById("lovelist-config");
    if (!el) return {};
    try {
      return JSON.parse(el.textContent);
    } catch (e) {
      return {};
    }
  }

  function uuid() {
    if (window.crypto && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  function retrasar(fn, ms) {
    var t;
    return function () {
      clearTimeout(t);
      t = setTimeout(fn, ms);
    };
  }

  /**
   * localStorage puede lanzar (incógnito estricto, cookies bloqueadas).
   * Si no está, usamos memoria: la sesión funciona igual, no sobrevive al cierre.
   */
  var almacen = (function () {
    try {
      var k = "__lovelist__";
      window.localStorage.setItem(k, "1");
      window.localStorage.removeItem(k);
      return window.localStorage;
    } catch (e) {
      var mem = {};
      return {
        getItem: function (k) {
          return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null;
        },
        setItem: function (k, v) {
          mem[k] = String(v);
        },
        removeItem: function (k) {
          delete mem[k];
        },
      };
    }
  })();

  /**
   * Identidad de invitado. El servidor prefiere el logged_in_customer_id que
   * inyecta el App Proxy, así que mandar esto siempre es inofensivo: cuando hay
   * sesión iniciada, se ignora.
   */
  function idAnonimo() {
    var v = almacen.getItem(LS_ID);
    if (!v) {
      v = uuid();
      almacen.setItem(LS_ID, v);
    }
    return v;
  }

  /**
   * Con sesión iniciada quien dice quién sos es el App Proxy, así que no
   * inventamos un UUID nuevo solo para acompañar la petición: mandamos el que
   * hubiera, y si no hay, nada. Crear uno acá dejaría basura en localStorage
   * justo después de haberlo limpiado al fusionar.
   */
  function idParaEnviar() {
    if (cfg.clienteConectado) return almacen.getItem(LS_ID) || "";
    return idAnonimo();
  }

  function aGid(id) {
    var s = String(id == null ? "" : id).trim();
    if (!s) return "";
    return s.indexOf("gid://") === 0 ? s : "gid://shopify/Product/" + s;
  }

  function deGid(gid) {
    var s = String(gid == null ? "" : gid);
    var i = s.lastIndexOf("/");
    return i === -1 ? s : s.slice(i + 1);
  }

  function handleDeUrl(href) {
    if (!href) return null;
    var m = String(href).match(/\/products\/([^/?#]+)/);
    return m ? m[1] : null;
  }

  /**
   * Caché persistente handle -> productId.
   *
   * Es la pieza que permite pintar los corazones al cargar la página. El
   * servidor guarda IDs (decisión del plan), pero el marcado de una tarjeta de
   * colección solo trae el handle, y el storefront no puede pedir un producto
   * por ID sin credenciales. La relación handle↔ID no cambia nunca, así que
   * cachearla es seguro y hace que la segunda visita no cueste una sola
   * petición.
   */
  function mapaIds() {
    try {
      return JSON.parse(almacen.getItem(LS_HANDLES) || "{}") || {};
    } catch (e) {
      return {};
    }
  }

  function recordarId(handle, productId) {
    if (!handle || !productId) return;
    var m = mapaIds();
    if (m[handle] === productId) return;
    m[handle] = productId;
    var claves = Object.keys(m);
    if (claves.length > MAX_HANDLES) {
      claves.slice(0, claves.length - MAX_HANDLES).forEach(function (k) {
        delete m[k];
      });
    }
    try {
      almacen.setItem(LS_HANDLES, JSON.stringify(m));
    } catch (e) {
      /* cuota llena: no es crítico */
    }
  }

  function idDeHandle(handle) {
    return handle ? mapaIds()[handle] || null : null;
  }

  // -------------------------------------------------------------------------
  // Cliente de la API (todo por el App Proxy)
  // -------------------------------------------------------------------------

  function api(ruta, opciones) {
    opciones = opciones || {};
    var metodo = opciones.method || "GET";
    var url = RUTA + ruta;
    var init = { method: metodo, headers: {}, credentials: "same-origin" };

    var identidad = idParaEnviar();

    if (metodo === "GET") {
      if (identidad) {
        url +=
          (url.indexOf("?") === -1 ? "?" : "&") +
          "anonymousId=" +
          encodeURIComponent(identidad);
      }
    } else {
      var cuerpo = opciones.body || {};
      if (identidad && !cuerpo.anonymousId) cuerpo.anonymousId = identidad;
      init.headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(cuerpo);
    }

    return fetch(url, init).then(function (res) {
      return res.text().then(function (texto) {
        var datos = null;
        try {
          datos = JSON.parse(texto);
        } catch (e) {
          /* el proxy o el tema devolvieron algo que no es JSON */
        }
        if (!res.ok || !datos || datos.ok !== true) {
          var err = new Error((datos && datos.message) || T.errorGuardar || "Error");
          err.codigo = datos && datos.code;
          err.status = res.status;
          throw err;
        }
        return datos;
      });
    });
  }

  // -------------------------------------------------------------------------
  // Estado
  // -------------------------------------------------------------------------

  var estado = {
    listas: [],
    items: [],
    cargado: false,
    /** productId -> datos resueltos por el servidor. Se llena bajo demanda. */
    productos: {},
    productosListos: false,
  };

  function reindexar() {
    estado.items = [];
    estado.listas.forEach(function (l) {
      (l.items || []).forEach(function (it) {
        estado.items.push({
          id: it.id,
          productId: it.productId,
          variantId: it.variantId,
          listId: l.id,
        });
      });
    });
  }

  /**
   * El corazón es a nivel producto: si el producto está en alguna lista, está
   * "guardado", sin importar la variante. Es lo que espera el comprador cuando
   * ve un corazón lleno en una tarjeta de colección.
   */
  function itemDe(productId) {
    for (var i = 0; i < estado.items.length; i++) {
      if (estado.items[i].productId === productId) return estado.items[i];
    }
    return null;
  }

  function total() {
    return estado.items.length;
  }

  function cargar() {
    return api("/lists")
      .then(function (r) {
        estado.listas = r.lists || [];
        estado.cargado = true;
        reindexar();
        pintarTodo();
      })
      .catch(function (e) {
        // Sin favoritos cargados la página sigue funcionando; los corazones
        // quedan vacíos y el primer clic reintenta.
        registrar("no se pudieron cargar las listas", e);
      });
  }

  function registrar(mensaje, e) {
    if (window.console && console.warn) console.warn("[Lovelist] " + mensaje, e || "");
  }

  /**
   * Trae del servidor los datos de los productos guardados.
   *
   * Esto reemplaza el apaño de la Fase 2.2, que deducía el producto a partir de
   * un caché de handles en localStorage: no funcionaba para nada guardado desde
   * otro dispositivo. Ahora lo resuelve el servidor contra la Admin API.
   *
   * Se pide bajo demanda —al abrir el drawer o al entrar a la página— y no
   * después de cada corazón: cada llamada es una consulta a la Admin API, y
   * gastarla en cada clic sería tirar cuota de la tienda a la basura.
   */
  var yaPedidos = {};

  /**
   * La identidad de un favorito es producto+variante, no el producto.
   *
   * Guardar la camisa negra y la blanca son dos decisiones distintas y se ven
   * como dos favoritos. Tiene que coincidir con `claveDeItem` del servidor.
   */
  function clave(item) {
    return item.productId + "|" + (item.variantId || "");
  }

  function asegurarProductos() {
    var falta = estado.items.some(function (i) {
      return !yaPedidos[clave(i)];
    });
    if (!falta) {
      estado.productosListos = true;
      return Promise.resolve();
    }

    return api("/products", { method: "POST" })
      .then(function (r) {
        var mapa = {};
        (r.products || []).forEach(function (p) {
          mapa[p.clave] = p;
        });
        estado.productos = mapa;
        // Marcamos incluso los que no vinieron: un producto borrado no va a
        // aparecer nunca, y sin esto lo volveríamos a pedir en cada repintado.
        estado.items.forEach(function (i) {
          yaPedidos[clave(i)] = true;
        });
        estado.productosListos = true;
      })
      .catch(function (e) {
        registrar("no se pudieron resolver los productos", e);
        // Sin esto el drawer se quedaría en "Cargando…" para siempre.
        estado.productosListos = true;
      });
  }

  /**
   * Formatea un importe siguiendo el idioma de la TIENDA, no el de la interfaz.
   *
   * Puede sonar raro teniendo la interfaz en español, pero no hay una única
   * convención latinoamericana: México escribe 1,999.00 y Argentina 1.999,00.
   * Fijar una sola sería incorrecto para el resto. Y sobre todo, el comprador
   * compara este precio con el que ve en la ficha del producto: si los dos no
   * se escriben igual, parece un error nuestro.
   */
  function formatearMonto(monto, moneda) {
    var n = Number(monto);
    if (!isFinite(n)) return "";
    try {
      return new Intl.NumberFormat(cfg.idioma || "es", {
        style: "currency",
        currency: moneda || cfg.moneda || "USD",
      }).format(n);
    } catch (e) {
      return n.toFixed(2) + " " + (moneda || "");
    }
  }

  /** Los precios llegan del servidor sin formato para poder formatearlos acá. */
  function formatearPreciosEnPantalla(raiz) {
    todos("[data-lovelist-precio]", raiz).forEach(function (el) {
      if (el.textContent) return;
      el.textContent = formatearMonto(
        el.getAttribute("data-lovelist-precio"),
        el.getAttribute("data-lovelist-moneda"),
      );
    });
  }

  /**
   * Agrega variantes al carrito SIN sacar al comprador de donde está.
   *
   * Antes esto mandaba a /cart. Está mal para el Shopify de hoy: la mayoría de
   * los temas usan un panel lateral, muchos merchants ni siquiera tienen
   * habilitada la página de carrito, y varios llevan directo al pago. Sacar a
   * alguien de donde está justo cuando decidió comprar es perder la venta.
   *
   * No hay una forma unificada de refrescar el panel del tema: Shopify lo
   * confirmó en su foro de desarrolladores y el drawer es del tema, no suyo.
   * Así que hay exactamente dos caminos, los dos comprobados, ninguno a medias:
   *
   *   1. El tema expone un <cart-drawer> con `renderContents()`. Le
   *      preguntamos qué secciones necesita con su `getSectionsToRender()`,
   *      las pedimos en el mismo /cart/add.js y le entregamos el resultado.
   *      En Dawn eso actualiza el panel y lo abre solo. Es la misma llamada
   *      que hace el formulario de producto del propio Dawn.
   *   2. Cualquier otra cosa: se va a /cart, que funciona en todos los temas.
   *
   * Hubo una tercera capa que despachaba `cart:update` y `cart:refresh` por si
   * algún tema escuchaba. Se quitó: no se podía verificar contra ningún tema
   * que tengamos, y un tema que la atendiera a medias quedaría peor que
   * redirigido. También se quitó un aviso propio al pie de la página: cuando
   * no hay panel, un cartel de cuatro segundos abajo del todo no es una
   * confirmación, es ruido.
   */
  function alCarrito(ids) {
    // Sin repetir: dos favoritos distintos del mismo producto pueden apuntar a
    // la misma variante vendible, y mandarla dos veces la agrega por duplicado.
    var vistos = {};
    var items = ids
      .filter(Boolean)
      .filter(function (id) {
        if (vistos[id]) return false;
        vistos[id] = true;
        return true;
      })
      .map(function (id) {
        return { id: Number(id), quantity: 1 };
      })
      .filter(function (i) {
        return isFinite(i.id) && i.id > 0;
      });
    if (!items.length) return;

    var panel = panelDelTema();
    var cuerpo = { items: items };

    var secciones = seccionesDelPanel(panel);
    if (secciones) {
      cuerpo.sections = secciones;
      // El contexto de renderizado va fijo a la raíz y NO a la página actual.
      //
      // /cart/add.js devuelve `sections: null` cuando se le pide renderizar en
      // el contexto de una URL del App Proxy, que es justo donde vive esta
      // página (/apps/lovelist). Con secciones nulas, Dawn revienta al hacer
      // parsedState.sections['cart-drawer'] y el panel nunca se abría.
      //
      // Cuesta verlo porque el mismo pedido por otros caminos SÍ funciona
      // sobre esa ruta: un GET /apps/lovelist?sections=... devuelve el HTML, y
      // /cart/update.js también. Solo add.js falla en ese contexto.
      //
      // La raíz sirve para todas las páginas: lo que muestra el panel depende
      // del carrito, no de dónde estaba parado el comprador.
      cuerpo.sections_url = "/";
    }

    fetch("/cart/add.js", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(cuerpo),
    })
      .then(function (r) {
        if (!r.ok) throw new Error("carrito " + r.status);
        return r.json();
      })
      .then(function (respuesta) {
        pintarContador();

        // Se exige que las secciones hayan venido de verdad. Sin esto el fallo
        // quedaba escondido: Shopify respondía con `sections: null`, el tema
        // tiraba una excepción que nosotros atrapábamos, y el comprador veía
        // un cartelito en vez de su carrito. Un modo de fallo silencioso.
        if (
          panel &&
          typeof panel.renderContents === "function" &&
          respuesta &&
          respuesta.sections
        ) {
          try {
            // La otra mitad del contrato del llamador, que nos faltaba.
            //
            // Si la página se cargó con el carrito vacío —el caso más común:
            // el comprador agrega su primer producto—, el <cart-drawer> del
            // tema arrastra la clase `is-empty`, y en Dawn eso esconde por CSS
            // el encabezado y la lista de productos:
            //
            //   cart-drawer.is-empty .drawer__header { display: none }
            //   .is-empty .cart__contents            { display: none }
            //
            // La clase vive en el HOST, por fuera de #CartDrawer, así que
            // `renderContents` reemplaza el contenido y nunca la limpia: los
            // productos entran al DOM y quedan invisibles. El panel se abría en
            // blanco, con el subtotal correcto abajo —ese no lo esconde ninguna
            // regla— y todo lo demás vacío.
            //
            // Quien la quita en Dawn es el LLAMADOR, no renderContents: su
            // product-form.js hace exactamente esta línea antes de renderizar.
            // No es adivinar un selector interno: es completar el contrato que
            // el propio tema implementa. En un tema que no use esa clase,
            // quitar algo que no está no hace nada.
            if (panel.classList.contains("is-empty")) {
              panel.classList.remove("is-empty");
            }

            // En Dawn esto actualiza el panel y lo abre solo: el comprador ve
            // su carrito sin salir de donde estaba.
            panel.renderContents(respuesta);
            return;
          } catch (e) {
            registrar("el panel del tema no acepto el contenido", e);
          }
        }

        // Sin panel utilizable, al carrito. Funciona en todos los temas.
        window.location.href = "/cart";
      })
      .catch(function (e) {
        registrar("no se pudo agregar al carrito", e);
        avisar(T.errorCarrito);
      });
  }

  /** El <cart-drawer> del tema, si lo hay. No se buscan clases ni ids. */
  function panelDelTema() {
    try {
      return document.querySelector("cart-drawer");
    } catch (e) {
      return null;
    }
  }

  /**
   * Qué secciones pedirle a Shopify que renderice, según el propio tema.
   *
   * No las escribimos nosotros: se las pedimos al elemento del tema. Si algún
   * día Dawn cambia sus secciones, esto lo sigue sin que toquemos nada.
   */
  function seccionesDelPanel(panel) {
    if (!panel || typeof panel.getSectionsToRender !== "function") return null;
    try {
      var lista = panel.getSectionsToRender() || [];
      var ids = [];
      for (var i = 0; i < lista.length; i++) {
        var id = lista[i] && lista[i].id;
        if (id) ids.push(id);
      }
      return ids.length ? ids : null;
    } catch (e) {
      registrar("no se pudieron leer las secciones del tema", e);
      return null;
    }
  }


  /**
   * Une lo que el visitante guardó como invitado con su cuenta, la primera vez
   * que lo vemos con sesión iniciada.
   *
   * Se corre ANTES de leer las listas, para no llegar a pintar el estado de
   * antes de la fusión. Si falla, conservamos el anonymousId a propósito: es la
   * única llave que queda hacia esos favoritos, y el próximo intento reintenta.
   * Borrarlo ante un error sería tirar los datos del comprador.
   */
  function fusionarSiHaceFalta() {
    if (!cfg.clienteConectado) return Promise.resolve();

    var anonimo = almacen.getItem(LS_ID);
    if (!anonimo) return Promise.resolve();

    return api("/merge", { method: "POST", body: { anonymousId: anonimo } })
      .then(function (r) {
        almacen.removeItem(LS_ID);
        if (r.listasMovidas || r.listasFusionadas) {
          registrar(
            "favoritos de invitado unidos a la cuenta: " +
              r.listasMovidas +
              " movidas, " +
              r.listasFusionadas +
              " fusionadas, " +
              r.itemsMovidos +
              " items",
          );
        }
      })
      .catch(function (e) {
        registrar("no se pudo unir los favoritos de invitado", e);
      });
  }

  // -------------------------------------------------------------------------
  // Botón de corazón
  // -------------------------------------------------------------------------

  var SVG_LLENO =
    '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">' +
    '<path d="M12 21s-7.5-4.9-9.6-9A5.6 5.6 0 0 1 12 5.7 5.6 5.6 0 0 1 21.6 12c-2.1 4.1-9.6 9-9.6 9z"/></svg>';
  var SVG_VACIO =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true" focusable="false">' +
    '<path d="M12 20.3S5.2 15.8 3.3 12.2A4.9 4.9 0 0 1 12 7.1a4.9 4.9 0 0 1 8.7 5.1c-1.9 3.6-8.7 8.1-8.7 8.1z"/></svg>';

  function crearBoton(datos) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "lovelist-corazon";
    b.setAttribute("data-lovelist-boton", "");
    b.setAttribute("aria-pressed", "false");
    b.setAttribute("aria-label", T.guardar || "Guardar en favoritos");
    if (datos.productId) b.setAttribute("data-lovelist-producto", datos.productId);
    if (datos.variantId) b.setAttribute("data-lovelist-variante", datos.variantId);
    if (datos.handle) b.setAttribute("data-lovelist-handle", datos.handle);
    b.innerHTML = SVG_VACIO;
    return b;
  }

  /** Cambia el aspecto del botón sin mirar ni tocar el estado. */
  function aplicarEstadoVisual(btn, activo) {
    var etiqueta = activo ? T.quitar : T.guardar;

    btn.setAttribute("aria-pressed", activo ? "true" : "false");
    btn.setAttribute("aria-label", etiqueta || "");
    btn.classList.toggle("lovelist-activo", activo);

    var icono = btn.querySelector(".lovelist-icono");
    if (icono) icono.innerHTML = activo ? SVG_LLENO : SVG_VACIO;
    else btn.innerHTML = activo ? SVG_LLENO : SVG_VACIO;

    var texto = btn.querySelector("[data-lovelist-texto]");
    if (texto) texto.textContent = etiqueta || "";
  }

  function pintarBoton(btn) {
    var pid = btn.getAttribute("data-lovelist-producto");
    if (!pid) return; // todavía sin resolver: lo dejamos como esté
    aplicarEstadoVisual(btn, !!itemDe(aGid(pid)));
  }

  function pintarTodo() {
    todos("[data-lovelist-boton]").forEach(pintarBoton);
    pintarContador();
    resolverPendientes();
    if (drawerAbierto()) {
      pintarDrawer();
      asegurarProductos().then(pintarDrawer);
    }
    pintarPagina();
  }

  // ---- resolución de handles pendientes -----------------------------------
  //
  // Una tarjeta de colección solo trae el handle, y sin el productId no
  // podemos saber si está guardada: el corazón se quedaría vacío para siempre
  // aunque el servidor lo tenga. Esto cierra ese hueco.
  //
  // Se paga lo mínimo: nada si el visitante no tiene nada guardado, nada si el
  // handle ya está en caché. El resto se resuelve de a cuatro y con un techo
  // por carga; lo que quede afuera se resuelve solo si el comprador lo toca.
  //
  // Antes esto usaba IntersectionObserver para pedir únicamente las tarjetas
  // que entraban en pantalla. Se descartó: en una pestaña en segundo plano el
  // navegador no calcula intersecciones y los corazones no se pintaban nunca.
  // Un comportamiento que depende de si la pestaña está visible es además
  // imposible de probar de forma fiable.

  var MAX_EN_PARALELO = 4;
  var MAX_POR_CARGA = 40;
  var enVuelo = 0;
  var resueltosEnEstaCarga = 0;
  var pendientes = [];

  function bombearCola() {
    while (enVuelo < MAX_EN_PARALELO && pendientes.length) {
      // El lanzamiento va en su propia función a propósito: con `var btn`
      // dentro del while, todos los callbacks compartirían la misma variable
      // —`var` es de función, no de bloque— y terminarían repintando siempre
      // el último botón.
      lanzarResolucion(pendientes.shift());
    }
  }

  function lanzarResolucion(btn) {
    enVuelo++;
    resolverProducto(btn)
      .then(function () {
        pintarBoton(btn);
      })
      .catch(function (e) {
        registrar("no se pudo resolver un handle", e);
      })
      .then(function () {
        enVuelo--;
        bombearCola();
      });
  }

  function resolverPendientes() {
    // Sin nada guardado no hay corazón que llenar: no gastamos una sola petición.
    if (!estado.cargado || !estado.items.length) return;

    todos("[data-lovelist-boton]").forEach(function (btn) {
      if (btn.getAttribute("data-lovelist-producto")) return;

      var handle = btn.getAttribute("data-lovelist-handle");
      if (!handle) return;

      var cacheado = idDeHandle(handle);
      if (cacheado) {
        btn.setAttribute("data-lovelist-producto", deGid(cacheado));
        pintarBoton(btn);
        return;
      }

      if (btn.hasAttribute("data-lovelist-encolado")) return;
      if (resueltosEnEstaCarga >= MAX_POR_CARGA) return;

      resueltosEnEstaCarga++;
      btn.setAttribute("data-lovelist-encolado", "");
      pendientes.push(btn);
    });

    bombearCola();
  }

  /**
   * En la página de producto el ID viene de Liquid. En una tarjeta de colección
   * puede que solo tengamos el handle: ahí lo resolvemos con el JSON público de
   * la tienda, que no necesita ningún scope.
   */
  function resolverProducto(btn) {
    var directo = btn.getAttribute("data-lovelist-producto");
    if (directo) {
      return Promise.resolve({
        productId: aGid(directo),
        variantId: varianteViva(btn),
      });
    }

    var handle = btn.getAttribute("data-lovelist-handle");
    if (!handle) return Promise.reject(new Error("sin producto ni handle"));

    return fetch("/products/" + encodeURIComponent(handle) + ".js", {
      headers: { Accept: "application/json" },
      credentials: "same-origin",
    })
      .then(function (r) {
        if (!r.ok) throw new Error("no se pudo resolver el handle");
        return r.json();
      })
      .then(function (p) {
        var pid = aGid(p.id);
        btn.setAttribute("data-lovelist-producto", String(p.id));
        recordarId(handle, pid);
        return { productId: pid, variantId: null };
      });
  }

  /**
   * Variante seleccionada en el momento del clic. Leerla ahora, en vez de
   * seguir los cambios del selector, nos ahorra depender de los eventos que
   * cada tema inventa por su cuenta.
   */
  function varianteViva(btn) {
    var form = btn.closest ? btn.closest("form[action*='/cart/add']") : null;
    if (!form) {
      var seccion = btn.closest ? btn.closest("[data-section-id], section, main") : null;
      form = seccion ? seccion.querySelector("form[action*='/cart/add']") : null;
    }
    var campo = form ? form.querySelector("[name='id']") : null;
    if (campo && campo.value) return String(campo.value);

    var enUrl = new URLSearchParams(window.location.search).get("variant");
    if (enUrl) return enUrl;

    return btn.getAttribute("data-lovelist-variante") || null;
  }

  function alternar(btn) {
    if (btn.hasAttribute("data-lovelist-ocupado")) return;
    btn.setAttribute("data-lovelist-ocupado", "");

    var yaAvisamos = false;

    /**
     * Feedback inmediato y sincrónico, antes de tocar la red.
     *
     * Esto no puede esperar a resolverProducto: en una tarjeta de colección sin
     * el ID en el DOM, resolverlo es una petición más, y el comprador vería el
     * corazón quedarse quieto medio segundo después de tocarlo.
     */
    var pidConocido = btn.getAttribute("data-lovelist-producto");
    aplicarEstadoVisual(btn, pidConocido ? !itemDe(aGid(pidConocido)) : true);

    resolverProducto(btn)
      .then(function (info) {
        var existente = itemDe(info.productId);
        var previos = estado.items.slice();
        if (existente) {
          estado.items = estado.items.filter(function (i) {
            return i.id !== existente.id;
          });
        } else {
          estado.items.push({
            id: "__optimista__",
            productId: info.productId,
            variantId: info.variantId || null,
            listId: null,
          });
        }
        pintarTodo();

        var peticion = existente
          ? api("/items/" + encodeURIComponent(existente.id), { method: "DELETE" })
          : api("/items", {
              method: "POST",
              body: { productId: info.productId, variantId: info.variantId || null },
            });

        var handle = btn.getAttribute("data-lovelist-handle");
        if (handle) recordarId(handle, info.productId);

        return peticion
          .then(function () {
            // Releemos para quedar exactamente igual que el servidor.
            return cargar();
          })
          .catch(function (e) {
            estado.items = previos; // revertimos
            pintarTodo();
            avisar(mensajeDeError(e, !!existente));
            yaAvisamos = true;
            throw e;
          });
      })
      .catch(function (e) {
        registrar("no se pudo alternar el favorito", e);
        // Puede haber fallado antes de resolver el producto, con el corazón ya
        // pintado en optimista: hay que devolverlo a como estaba.
        if (btn.getAttribute("data-lovelist-producto")) pintarBoton(btn);
        else aplicarEstadoVisual(btn, false);
        if (!yaAvisamos) avisar(T.errorGuardar);
      })
      .then(function () {
        btn.removeAttribute("data-lovelist-ocupado");
      });
  }

  /**
   * El storefront habla con su propia voz. Del servidor solo tomamos los
   * códigos de negocio, no su texto: acá sabemos si el comprador estaba
   * guardando o quitando, y el servidor no.
   */
  function mensajeDeError(e, estabaGuardado) {
    if (e && e.codigo === "listaLlena") return T.listaLlena;
    if (e && e.codigo === "demasiadasEscrituras") return T.demasiadoRapido;
    return estabaGuardado ? T.errorQuitar : T.errorGuardar;
  }

  // -------------------------------------------------------------------------
  // Aviso breve (no usamos alert: bloquea y es feo dentro de un tema)
  // -------------------------------------------------------------------------

  var tiempoAviso;

  function avisar(mensaje) {
    if (!mensaje) return;
    var caja = document.getElementById("lovelist-aviso");
    if (!caja) {
      caja = document.createElement("div");
      caja.id = "lovelist-aviso";
      caja.className = "lovelist-aviso";
      caja.setAttribute("role", "status");
      caja.setAttribute("aria-live", "polite");
      caja.setAttribute("data-lovelist-ui", "");
      document.body.appendChild(caja);
    }
    caja.textContent = mensaje;
    caja.classList.add("lovelist-aviso-visible");
    clearTimeout(tiempoAviso);
    tiempoAviso = setTimeout(function () {
      caja.classList.remove("lovelist-aviso-visible");
    }, 4000);
  }

  // -------------------------------------------------------------------------
  // Inyección en tarjetas de colección
  //
  // No podemos usar clases de un tema concreto, así que partimos de lo único
  // que todos comparten: un enlace a /products/<handle>. Desde ahí subimos
  // buscando el contenedor que hace de tarjeta.
  // -------------------------------------------------------------------------

  function tieneImagen(nodo) {
    return !!nodo.querySelector("img, picture, svg");
  }

  /**
   * Cuántos productos distintos enlaza este nodo. Es el mejor discriminador
   * que encontramos que no depende del tema: una tarjeta enlaza exactamente un
   * producto (aunque lo haga dos veces, desde la imagen y desde el título),
   * mientras que una grilla enlaza muchos. Corta en cuanto ve el segundo.
   */
  function handlesDistintos(nodo) {
    var vistos = {};
    var n = 0;
    var enlaces = nodo.querySelectorAll('a[href*="/products/"]');
    for (var i = 0; i < enlaces.length; i++) {
      var h = handleDeUrl(enlaces[i].getAttribute("href"));
      if (h && !vistos[h]) {
        vistos[h] = 1;
        n++;
        if (n > 1) return n;
      }
    }
    return n;
  }

  var CORTE = { MAIN: 1, BODY: 1, HEADER: 1, FOOTER: 1, NAV: 1 };

  /**
   * Sube desde el enlace hasta el contenedor que hace de tarjeta.
   *
   * Se queda con el ancestro MÁS BAJO que contenga una imagen. Subir hasta el
   * más alto parecía mejor, pero elige de más: basta con que un envoltorio
   * tenga un solo producto dentro —lo que pasa seguido con la carga infinita,
   * que va agregando contenedores nuevos— para que el corazón termine fuera de
   * la tarjeta.
   */
  function contenedorDeTarjeta(enlace) {
    var padre = enlace.parentElement;

    if (tieneImagen(enlace)) {
      // El enlace envuelve la imagen. Subimos un nivel solo si ese nivel sigue
      // siendo la misma tarjeta, para que el corazón quede sobre la tarjeta y
      // no dentro del <a>, donde el posicionamiento depende de si el tema lo
      // dejó en línea.
      if (padre && !CORTE[padre.tagName] && handlesDistintos(padre) === 1) {
        return padre;
      }
      return enlace;
    }

    var nodo = padre;
    for (var i = 0; i < NIVELES_TARJETA && nodo; i++) {
      if (CORTE[nodo.tagName]) break;
      if (tieneImagen(nodo)) {
        // Si acá dentro hay más de un producto, esto ya es una grilla y no una
        // tarjeta: mejor no inyectar nada que inyectar en el lugar equivocado.
        return handlesDistintos(nodo) > 1 ? null : nodo;
      }
      nodo = nodo.parentElement;
    }
    return null;
  }

  /**
   * Segunda señal para distinguir una tarjeta de un banner.
   *
   * "Tiene imagen y enlaza un solo producto" no alcanza: los banners
   * promocionales, las secciones de imagen con texto y los bloques destacados
   * cumplen exactamente esa forma, y terminaban con un corazón encima.
   *
   * Pedimos una de dos: que tenga hermanos de la misma forma (o sea, que viva
   * en una grilla) o que muestre un precio. Un banner no cumple ninguna.
   */
  function pareceTarjetaDeProducto(tarjeta) {
    return tieneHermanoConProducto(tarjeta) || tienePrecio(tarjeta);
  }

  function tieneHermanoConProducto(tarjeta) {
    var padre = tarjeta.parentElement;
    if (!padre) return false;
    var hijos = padre.children;
    for (var i = 0; i < hijos.length; i++) {
      if (hijos[i] === tarjeta || !hijos[i].querySelector) continue;
      if (hijos[i].querySelector('a[href*="/products/"]')) return true;
    }
    return false;
  }

  // Símbolo de moneda pegado a un número, en cualquiera de los dos órdenes.
  var PRECIO =
    /(?:[$€£¥₹₺₪]|\b(?:USD|EUR|GBP|ARS|MXN|COP|CLP|PEN|UYU|BRL)\b)\s?\d|\d[\d.,]*\s?[$€£¥₹₺₪]/;

  function tienePrecio(tarjeta) {
    // `price` no es de un tema concreto: es la convención de casi todos los de
    // Shopify. Va como pista, nunca como único criterio.
    if (tarjeta.querySelector('[class*="price"], [data-price], .money')) return true;
    return PRECIO.test((tarjeta.textContent || "").slice(0, 500));
  }

  function inyectable(enlace) {
    if (!enlace.closest) return false;
    // Nuestra propia interfaz, y los menús: ahí un corazón no tiene sentido.
    if (enlace.closest("[data-lovelist-ui]")) return false;
    if (enlace.closest("header, nav, [role='navigation']")) return false;
    return true;
  }

  // Producto de la página actual, si estamos en una. Sus enlaces no llevan
  // corazón inyectado: de ese producto se ocupa el app block.
  var handleActual = (function () {
    var m = window.location.pathname.match(/\/products\/([^/?#]+)/);
    return m ? m[1] : null;
  })();

  function escanear(raiz) {
    var enlaces;
    try {
      enlaces = todos('a[href*="/products/"]', raiz);
    } catch (e) {
      return;
    }

    enlaces.forEach(function (a) {
      try {
        if (!inyectable(a)) return;

        var handle = handleDeUrl(a.getAttribute("href"));
        if (!handle) return;
        if (handleActual && handle === handleActual) return;

        var tarjeta = contenedorDeTarjeta(a);
        if (!tarjeta) return;
        if (tarjeta.hasAttribute("data-lovelist-tarjeta")) return;
        if (tarjeta.querySelector("[data-lovelist-boton]")) {
          tarjeta.setAttribute("data-lovelist-tarjeta", "");
          return;
        }
        if (tarjeta.offsetWidth && tarjeta.offsetWidth < ANCHO_MINIMO_TARJETA) return;
        if (!pareceTarjetaDeProducto(tarjeta)) return;

        // Si el tema ya expone el ID, nos ahorramos resolverlo después.
        var idEnDom = tarjeta.getAttribute("data-product-id") || null;
        if (!idEnDom) {
          var conId = tarjeta.querySelector("[data-product-id]");
          if (conId) idEnDom = conId.getAttribute("data-product-id");
        }
        if (idEnDom && !/^\d+$/.test(idEnDom)) idEnDom = null;

        var btn = crearBoton({ handle: handle, productId: idEnDom });
        btn.classList.add("lovelist-corazon-tarjeta");

        // Para poder posicionar el corazón necesitamos un contexto. Solo lo
        // creamos si el tema no tenía ninguno, y sobre este elemento nada más.
        var posicion = window.getComputedStyle(tarjeta).position;
        if (posicion === "static") tarjeta.classList.add("lovelist-tarjeta-rel");

        tarjeta.setAttribute("data-lovelist-tarjeta", "");
        tarjeta.appendChild(btn);
        pintarBoton(btn);
      } catch (e) {
        // Una tarjeta rara no puede tumbar el resto de la página.
        registrar("no se pudo inyectar en una tarjeta", e);
      }
    });
  }

  // -------------------------------------------------------------------------
  // Contador
  // -------------------------------------------------------------------------

  var contador = null;

  function montarContador() {
    if (contador) return;

    contador = document.createElement("button");
    contador.type = "button";
    contador.className = "lovelist-contador";
    contador.setAttribute("data-lovelist-ui", "");
    contador.setAttribute("aria-label", T.abrirFavoritos || "Abrir mis favoritos");
    contador.innerHTML =
      '<span class="lovelist-contador-icono">' +
      SVG_VACIO +
      '</span><span class="lovelist-contador-numero" data-lovelist-numero>0</span>';
    contador.addEventListener("click", abrirDrawer);

    var carrito = enlaceDelCarrito();
    if (carrito && carrito.parentElement) {
      contador.classList.add("lovelist-contador-header");
      carrito.parentElement.insertBefore(contador, carrito);
    }

    // Comprobamos que de verdad se vea. Un tema puede tener el carrito dentro
    // de un menú plegado —Dawn mete uno en el drawer móvil, oculto— y ahí el
    // contador existiría sin que nadie pueda verlo nunca. Si pasó eso, o si no
    // encontramos dónde ponerlo, lo mandamos al modo flotante: vale más un
    // botón que se ve raro que uno invisible.
    if (!esVisible(contador)) {
      contador.classList.remove("lovelist-contador-header");
      contador.classList.add("lovelist-contador-flotante");
      document.body.appendChild(contador);
    }

    pintarContador();
  }

  function esVisible(el) {
    if (!el || !el.getClientRects || el.getClientRects().length === 0) return false;
    // getClientRects sigue devolviendo cajas con visibility:hidden, así que no
    // alcanza con preguntar por el layout.
    var cs = window.getComputedStyle(el);
    return cs.visibility !== "hidden" && cs.display !== "none";
  }

  /**
   * El enlace al carrito del header, pero solo si está a la vista.
   *
   * Un tema tiene varios: Dawn trae cinco, y el primero en orden del documento
   * vive dentro del menú móvil plegado. Quedarse con el primero que aparece
   * mete el contador en un cajón que nadie abre.
   */
  function enlaceDelCarrito() {
    var candidatos = todos(
      "header a[href*='/cart'], [role='banner'] a[href*='/cart']",
    ).filter(function (a) {
      // /cart/change y compañía no cuentan.
      return (
        /\/cart(\?|#|$)/.test(a.getAttribute("href") || "") && esVisible(a)
      );
    });

    if (!candidatos.length) return null;

    // Entre los visibles preferimos el que sea un icono: ese es el grupo de
    // iconos del header, que es donde el comprador espera un contador. Los
    // demás suelen ser entradas de texto del menú de navegación. Mirar si
    // contiene un svg funciona en cualquier tema; mirar clases, no.
    for (var i = 0; i < candidatos.length; i++) {
      if (candidatos[i].querySelector("svg, img")) return candidatos[i];
    }
    return candidatos[0];
  }

  function pintarContador() {
    if (!contador) return;
    var n = total();
    var numero = contador.querySelector("[data-lovelist-numero]");
    if (numero) numero.textContent = String(n);
    contador.classList.toggle("lovelist-contador-vacio", n === 0);
  }

  // -------------------------------------------------------------------------
  // Drawer
  // -------------------------------------------------------------------------

  var drawer = null;

  function drawerAbierto() {
    return !!drawer && drawer.classList.contains("lovelist-drawer-abierto");
  }

  function construirDrawer() {
    if (drawer) return;

    drawer = document.createElement("div");
    drawer.className = "lovelist-drawer";
    drawer.setAttribute("data-lovelist-ui", "");
    drawer.innerHTML =
      '<div class="lovelist-drawer-fondo" data-lovelist-cerrar></div>' +
      '<aside class="lovelist-drawer-panel" role="dialog" aria-modal="true" aria-label="' +
      escapar(T.misFavoritos || "Mis favoritos") +
      '">' +
      '<header class="lovelist-drawer-cabecera">' +
      '<h2 class="lovelist-drawer-titulo">' +
      escapar(T.misFavoritos || "Mis favoritos") +
      "</h2>" +
      '<button type="button" class="lovelist-drawer-cerrar" data-lovelist-cerrar aria-label="' +
      escapar(T.cerrar || "Cerrar") +
      '">&times;</button>' +
      "</header>" +
      '<div class="lovelist-drawer-cuerpo" data-lovelist-cuerpo></div>' +
      "</aside>";

    drawer.addEventListener("click", function (ev) {
      var cerrar = ev.target.closest && ev.target.closest("[data-lovelist-cerrar]");
      if (cerrar) cerrarDrawer();
    });

    document.body.appendChild(drawer);
  }

  function abrirDrawer() {
    construirDrawer();
    drawer.classList.add("lovelist-drawer-abierto");
    document.addEventListener("keydown", teclaEscape);
    var cerrar = drawer.querySelector(".lovelist-drawer-cerrar");
    if (cerrar) cerrar.focus();
    pintarDrawer();
    // Recién acá pedimos los datos de producto: mientras nadie abra el drawer,
    // no hay motivo para gastar una consulta a la Admin API.
    asegurarProductos().then(pintarDrawer);
  }

  function cerrarDrawer() {
    if (!drawer) return;
    drawer.classList.remove("lovelist-drawer-abierto");
    document.removeEventListener("keydown", teclaEscape);
    if (contador) contador.focus();
  }

  function teclaEscape(ev) {
    if (ev.key === "Escape") cerrarDrawer();
  }

  function escapar(s) {
    var d = document.createElement("div");
    d.textContent = String(s == null ? "" : s);
    return d.innerHTML;
  }

  function pintarDrawer() {
    if (!drawer) return;
    var cuerpo = drawer.querySelector("[data-lovelist-cuerpo]");
    if (!cuerpo) return;

    if (!estado.cargado || !estado.productosListos) {
      cuerpo.innerHTML =
        '<p class="lovelist-drawer-vacio">' + escapar(T.cargando) + "</p>";
      return;
    }

    if (!estado.items.length) {
      cuerpo.innerHTML =
        '<p class="lovelist-drawer-vacio"><strong>' +
        escapar(T.vacio) +
        "</strong><br>" +
        escapar(T.vacioAyuda) +
        "</p>";
      return;
    }

    var filas = [];
    estado.items.forEach(function (item) {
      var p = estado.productos[clave(item)];
      // Borrado, archivado o fuera del canal online: se oculta, no rompe nada.
      if (!p) return;
      filas.push(filaDrawer(item, p));
    });

    cuerpo.innerHTML =
      (filas.length
        ? '<ul class="lovelist-items">' + filas.join("") + "</ul>"
        : '<p class="lovelist-drawer-vacio">' + escapar(T.vacio) + "</p>") +
      '<a class="lovelist-drawer-ver-todos" href="' +
      RUTA +
      '">' +
      escapar(T.verTodos) +
      "</a>";

    todos("[data-lovelist-quitar]", cuerpo).forEach(function (b) {
      b.addEventListener("click", function () {
        quitarDesdeDrawer(b.getAttribute("data-lovelist-quitar"));
      });
    });
  }

  function filaDrawer(item, p) {
    return (
      '<li class="lovelist-item">' +
      '<a class="lovelist-item-medio" href="' +
      escapar(p.url) +
      '">' +
      (p.imagen
        ? '<img src="' +
          escapar(p.imagen) +
          '" alt="" loading="lazy" width="64" height="64">'
        : "") +
      "</a>" +
      '<div class="lovelist-item-datos">' +
      '<a class="lovelist-item-titulo" href="' +
      escapar(p.url) +
      '">' +
      escapar(p.title) +
      "</a>" +
      // Sin esto, dos favoritos del mismo producto con distinta variante se
      // ven como dos filas identicas y parecen un error de la app.
      (p.varianteTitulo
        ? '<span class="lovelist-item-variante">' +
          escapar(p.varianteTitulo) +
          "</span>"
        : "") +
      '<span class="lovelist-item-precio">' +
      escapar(formatearMonto(p.precio, p.moneda)) +
      "</span>" +
      (p.disponible
        ? ""
        : '<span class="lovelist-item-agotado">' +
          escapar(T.agotado) +
          "</span>") +
      "</div>" +
      '<button type="button" class="lovelist-item-quitar" data-lovelist-quitar="' +
      escapar(item.id) +
      '" aria-label="' +
      escapar(T.quitarDeLista) +
      '">&times;</button>' +
      "</li>"
    );
  }

  function quitarDesdeDrawer(itemId) {
    if (!itemId) return;
    var previos = estado.items.slice();
    estado.items = estado.items.filter(function (i) {
      return i.id !== itemId;
    });
    pintarTodo();

    api("/items/" + encodeURIComponent(itemId), { method: "DELETE" })
      .then(cargar)
      .catch(function (e) {
        estado.items = previos;
        pintarTodo();
        avisar(mensajeDeError(e, true));
      });
  }

  // -------------------------------------------------------------------------
  // Página completa (/apps/lovelist)
  //
  // El armazón lo manda el servidor en Liquid, para heredar el layout del tema.
  // Acá solo completamos la grilla, porque la identidad de un invitado vive en
  // su localStorage y el servidor no la tiene en una navegación normal.
  // -------------------------------------------------------------------------

  var paginaRaiz = null;
  var listaActivaId = null;

  function montarPagina() {
    paginaRaiz = document.querySelector("[data-lovelist-pagina]");
  }

  function listaActiva() {
    if (!estado.listas.length) return null;
    var elegida = null;
    estado.listas.forEach(function (l) {
      if (l.id === listaActivaId) elegida = l;
    });
    return elegida || estado.listas[0];
  }

  function pintarPagina() {
    if (!paginaRaiz) return;

    var cuerpo = paginaRaiz.querySelector("[data-lovelist-pagina-cuerpo]");
    var selector = paginaRaiz.querySelector("[data-lovelist-selector]");
    var acciones = paginaRaiz.querySelector("[data-lovelist-acciones]");
    var compartir = paginaRaiz.querySelector("[data-lovelist-compartir]");
    if (!cuerpo) return;

    if (!estado.cargado || !estado.productosListos) {
      cuerpo.innerHTML =
        '<p class="lovelist-pagina-cargando">' + escapar(T.cargando) + "</p>";
      return;
    }

    var lista = listaActiva();
    var items = lista ? lista.items : [];

    // Selector: solo tiene sentido si hay más de una lista.
    if (selector) {
      if (estado.listas.length > 1) {
        selector.innerHTML =
          '<select class="lovelist-selector" data-lovelist-cambiar-lista>' +
          estado.listas
            .map(function (l) {
              return (
                '<option value="' +
                escapar(l.id) +
                '"' +
                (lista && l.id === lista.id ? " selected" : "") +
                ">" +
                escapar(l.name) +
                " (" +
                l.items.length +
                ")</option>"
              );
            })
            .join("") +
          "</select>";
        selector.hidden = false;
        var sel = selector.querySelector("[data-lovelist-cambiar-lista]");
        if (sel) {
          sel.addEventListener("change", function () {
            listaActivaId = sel.value;
            if (compartir) {
              compartir.hidden = true;
              compartir.innerHTML = "";
            }
            pintarPagina();
          });
        }
      } else {
        selector.hidden = true;
        selector.innerHTML = "";
      }
    }

    var visibles = [];
    items.forEach(function (item) {
      var p = estado.productos[clave(item)];
      if (p) visibles.push({ item: item, producto: p });
    });

    if (!visibles.length) {
      cuerpo.innerHTML =
        '<p class="lovelist-pagina-vacia"><strong>' +
        escapar(T.vacio) +
        "</strong><br>" +
        escapar(T.vacioAyuda) +
        "</p>";
      if (acciones) {
        acciones.hidden = true;
        acciones.innerHTML = "";
      }
      return;
    }

    cuerpo.innerHTML =
      '<ul class="lovelist-grilla">' +
      visibles
        .map(function (v) {
          return tarjetaPagina(v.item, v.producto);
        })
        .join("") +
      "</ul>";

    if (acciones) {
      // Sin repetir: dos favoritos distintos pueden apuntar a la misma
      // variante vendible y mandarla dos veces la agregaria por duplicado.
      var yaEsta = {};
      var comprables = visibles
        .map(function (v) {
          return v.producto.variantIdParaCarrito;
        })
        .filter(Boolean)
        .filter(function (id) {
          if (yaEsta[id]) return false;
          yaEsta[id] = true;
          return true;
        });

      acciones.innerHTML =
        (comprables.length
          ? '<button type="button" class="lovelist-boton-principal" data-lovelist-agregar-todo="' +
            escapar(comprables.join(",")) +
            '">' +
            escapar(T.agregarTodo) +
            "</button>"
          : "") +
        (lista
          ? '<button type="button" class="lovelist-boton-secundario" data-lovelist-compartir-lista="' +
            escapar(lista.id) +
            '">' +
            escapar(T.compartir) +
            "</button>"
          : "");
      acciones.hidden = !acciones.innerHTML;
    }

    formatearPreciosEnPantalla(paginaRaiz);
  }

  function tarjetaPagina(item, p) {
    return (
      '<li class="lovelist-tarjeta">' +
      '<a class="lovelist-tarjeta-imagen" href="' +
      escapar(p.url) +
      '">' +
      (p.imagen
        ? '<img src="' +
          escapar(p.imagen) +
          '" alt="' +
          escapar(p.imagenAlt) +
          '" loading="lazy" width="300" height="300">'
        : "") +
      "</a>" +
      '<div class="lovelist-tarjeta-datos">' +
      '<a class="lovelist-tarjeta-titulo" href="' +
      escapar(p.url) +
      '">' +
      escapar(p.title) +
      "</a>" +
      (p.varianteTitulo
        ? '<span class="lovelist-tarjeta-variante">' +
          escapar(p.varianteTitulo) +
          "</span>"
        : "") +
      '<span class="lovelist-tarjeta-precio" data-lovelist-precio="' +
      escapar(p.precio) +
      '" data-lovelist-moneda="' +
      escapar(p.moneda) +
      '"></span>' +
      (p.variantIdParaCarrito
        ? '<button type="button" class="lovelist-boton-carrito" data-lovelist-al-carrito="' +
          escapar(p.variantIdParaCarrito) +
          '">' +
          escapar(T.alCarrito) +
          "</button>"
        : '<span class="lovelist-agotado">' + escapar(T.agotado) + "</span>") +
      '<button type="button" class="lovelist-tarjeta-quitar" data-lovelist-quitar-pagina="' +
      escapar(item.id) +
      '">' +
      escapar(T.quitarDeLista) +
      "</button>" +
      "</div>" +
      "</li>"
    );
  }

  function compartirLista(listaId) {
    var caja = paginaRaiz && paginaRaiz.querySelector("[data-lovelist-compartir]");
    if (!caja) return;

    api("/lists/" + encodeURIComponent(listaId) + "/share", { method: "POST" })
      .then(function (r) {
        var url = r.shareUrl;
        if (!url) throw new Error("sin url");
        var texto = T.mensajeCompartir + " " + url;

        caja.innerHTML =
          '<input class="lovelist-compartir-url" type="text" readonly value="' +
          escapar(url) +
          '" data-lovelist-url>' +
          '<div class="lovelist-compartir-botones">' +
          '<button type="button" class="lovelist-boton-secundario" data-lovelist-copiar>' +
          escapar(T.copiarLink) +
          "</button>" +
          '<a class="lovelist-boton-secundario" target="_blank" rel="noopener" href="https://wa.me/?text=' +
          encodeURIComponent(texto) +
          '">' +
          escapar(T.porWhatsapp) +
          "</a>" +
          '<a class="lovelist-boton-secundario" href="mailto:?subject=' +
          encodeURIComponent(T.asuntoEmail) +
          "&body=" +
          encodeURIComponent(texto) +
          '">' +
          escapar(T.porEmail) +
          "</a>" +
          "</div>";
        caja.hidden = false;

        var copiar = caja.querySelector("[data-lovelist-copiar]");
        if (copiar) {
          copiar.addEventListener("click", function () {
            copiarAlPortapapeles(url, copiar);
          });
        }
      })
      .catch(function (e) {
        registrar("no se pudo compartir la lista", e);
        avisar(T.errorCompartir);
      });
  }

  function copiarAlPortapapeles(texto, boton) {
    var listo = function () {
      var antes = boton.textContent;
      boton.textContent = T.copiado;
      setTimeout(function () {
        boton.textContent = antes;
      }, 2000);
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(texto).then(listo, function () {
        seleccionarUrl();
      });
      return;
    }
    seleccionarUrl();

    // Sin API de portapapeles (http, navegadores viejos) al menos dejamos el
    // texto seleccionado para que se pueda copiar a mano.
    function seleccionarUrl() {
      var campo = paginaRaiz && paginaRaiz.querySelector("[data-lovelist-url]");
      if (campo && campo.select) campo.select();
    }
  }

  function quitarDesdePagina(itemId) {
    var previos = estado.items.slice();
    estado.items = estado.items.filter(function (i) {
      return i.id !== itemId;
    });
    estado.listas.forEach(function (l) {
      l.items = l.items.filter(function (i) {
        return i.id !== itemId;
      });
    });
    pintarTodo();

    api("/items/" + encodeURIComponent(itemId), { method: "DELETE" })
      .then(cargar)
      .catch(function (e) {
        estado.items = previos;
        pintarTodo();
        avisar(mensajeDeError(e, true));
      });
  }

  // -------------------------------------------------------------------------
  // Arranque
  // -------------------------------------------------------------------------

  function iniciar() {
    try {
      document.addEventListener("click", function (ev) {
        if (!ev.target.closest) return;

        var btn = ev.target.closest("[data-lovelist-boton]");
        if (btn) {
          ev.preventDefault();
          ev.stopPropagation();
          alternar(btn);
          return;
        }

        // Estos viven tanto en la página propia como en la vista compartida,
        // que llega ya renderizada del servidor: por eso van delegados.
        var uno = ev.target.closest("[data-lovelist-al-carrito]");
        if (uno) {
          ev.preventDefault();
          alCarrito([uno.getAttribute("data-lovelist-al-carrito")]);
          return;
        }

        var todo = ev.target.closest("[data-lovelist-agregar-todo]");
        if (todo) {
          ev.preventDefault();
          alCarrito(todo.getAttribute("data-lovelist-agregar-todo").split(","));
          return;
        }

        var quitar = ev.target.closest("[data-lovelist-quitar-pagina]");
        if (quitar) {
          ev.preventDefault();
          quitarDesdePagina(quitar.getAttribute("data-lovelist-quitar-pagina"));
          return;
        }

        var compartir = ev.target.closest("[data-lovelist-compartir-lista]");
        if (compartir) {
          ev.preventDefault();
          compartirLista(compartir.getAttribute("data-lovelist-compartir-lista"));
        }
      });

      montarContador();
      montarPagina();
      escanear(document);

      // La vista compartida ya viene con los precios sin formato del servidor.
      formatearPreciosEnPantalla(document);

      // Carga infinita, filtros AJAX, cambios de sección en el editor de temas.
      if (window.MutationObserver) {
        var reescanear = retrasar(function () {
          escanear(document);
        }, 150);
        new MutationObserver(reescanear).observe(document.body, {
          childList: true,
          subtree: true,
        });
      }

      fusionarSiHaceFalta()
        .then(cargar)
        .then(function () {
          // En la página propia los datos de producto hacen falta ya; en el
          // resto del sitio se piden solo cuando se abre el drawer.
          if (paginaRaiz) return asegurarProductos().then(pintarPagina);
        });
    } catch (e) {
      registrar("no se pudo iniciar", e);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", iniciar);
  } else {
    iniciar();
  }
})();

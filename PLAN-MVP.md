# Lovelist — Plan del MVP

> Documento de trabajo. Vive en la raíz del repo y es la fuente de verdad del MVP.
> Escrito el 2026-08-08, después de completar la Fase 1 (cascarón desplegado).
> Actualizado el 2026-08-09: cambia el alcance de la Fase 2.5 (la configuración
> visual pasa a los settings del app embed block) y se corrigen dos reglas que
> decían algo imposible — la de i18n y la cuenta de endpoints del proxy.

---

## Cómo se trabaja con este documento

**Regla número uno: se ejecuta una fase a la vez y se para al terminarla.**

Al final de cada fase:

1. Correr `npm run typecheck` y `npm run build` — los dos deben pasar limpios.
2. Commitear y pushear a `main`.
3. **Parar.** Reportar qué quedó hecho y **cómo lo pruebo yo**, con pasos concretos
   y lo que debería ver en pantalla.
4. Esperar mi visto bueno antes de empezar la fase siguiente.

No adelantar fases. No dejar código de una fase futura "ya que estamos". Si algo de
una fase revela que una decisión de este documento está mal, **decirlo y parar**, no
improvisar una solución distinta en silencio.

Si una fase resulta más grande de lo que parece, partirla y avisarme — prefiero cuatro
entregas chicas y verificables que una grande que no sé por dónde probar.

---

## Estado actual (Fases 1 a 2.3 terminadas; 2.4 entregada sin verificar)

> Para el detalle de cómo se llegó hasta acá —decisiones, errores cometidos y
> trampas del entorno— ver [`BITACORA.md`](BITACORA.md). Este documento dice
> **qué** hay que hacer; la bitácora dice **cómo** llegamos y qué aprendimos.

**Fase 1 — cascarón desplegado**

- App creada en Partner Dashboard, org `appsdevelopers`, handle `lovelist`
- Desplegada en `https://lovelist-bay.vercel.app`
- Base de datos Neon (PostgreSQL 17) con `Session` y `Shop`
- App Proxy registrado en `/apps/lovelist` → `/proxy`
- Validación HMAC del proxy verificada (8/8 casos)
- Instalada y funcionando en `calendario-envios-test-final.myshopify.com`

**Fase 2.1 — datos y API del proxy**

- Modelos `Wishlist`, `WishlistItem`, `RateLimit`; `Shop.settings` y `Shop.uninstalledAt`
- Los siete endpoints de la tabla de la Fase 2.1, con firma verificada y propiedad
  comprobada en cada operación. Con lo que agregaron las fases 2.2 a 2.4, la
  superficie del proxy quedó en **once rutas**; la tabla completa está en la
  sección 3 de `BITACORA.md`
- Topes activos: 20 listas por identidad, 200 items por lista, 60 escrituras por
  minuto con limpieza oportunista de ventanas vencidas
- Webhooks de privacidad borrando de verdad: `customers/redact`, `shop/redact`,
  `customers/data_request` y `app/uninstalled`
- Verificado contra Neon y contra el storefront real

**Fase 2.2 — theme app extension**

- App embed block con el JS y el CSS compartidos, el contador y el drawer
- App block aparte para el botón de la página de producto
- Inyección de corazones en tarjetas de colección sin depender de clases de tema,
  con `MutationObserver` para carga infinita y filtros AJAX
- Caché persistente `handle → productId` en `localStorage`: sin ella los corazones
  no podrían pintarse al cargar, porque la base guarda IDs y el marcado del tema
  solo trae el handle
- Verificado en Dawn real: colección, home, header y banner
- Banco de pruebas versionado en `theme-src/banco-pruebas.html` (`npm run test:theme`),
  36 comprobaciones en tres modos

**Fase 2.3 — invitados y migración a cuenta**

- `POST /proxy/merge`: une las listas de invitado con las del cliente la primera
  vez que se lo ve con sesión iniciada
- Empareja por nombre; si no hay equivalente, **reasigna** la lista en vez de
  copiarla, así conserva su `shareToken` y un link ya compartido sigue vivo
- Fusiona, nunca reemplaza. Idempotente: al terminar no quedan listas anónimas
- Probado por Jonas en la tienda real, en incógnito y con cuenta

**Fase 2.4 — página completa y compartir**

- `app/productos.server.ts` resuelve los productos contra la Admin API. Esto
  reemplaza el apaño de la 2.2, que dependía de un caché de handles en
  `localStorage` y se perdía entre dispositivos
- `GET /apps/lovelist` devuelve Liquid y hereda el layout del tema
- `GET /apps/lovelist/shared/:token` va entera del servidor, con `noindex`
- `POST /proxy/products` para el drawer y la página
- Los productos borrados o despublicados se ocultan; los agotados salen marcados
- **Entregada pero sin verificar en la tienda real: ni un solo paso.** La sesión
  terminó en el momento de la entrega. Hasta que los siete pasos de verificación
  se corran en `calendario-envios-test-final`, esta fase **no está cerrada** y no
  se arranca la 2.5. Ver la sección 7 de `BITACORA.md`

**Confirmado en la tienda de desarrollo:** el App Proxy reenvía `PATCH` y `DELETE`
nativos. Se usan métodos HTTP normales; el respaldo `POST` + `_method` sigue
aceptado en el servidor pero el storefront no lo necesita.

**Al probar cambios del storefront: recarga forzada (Ctrl+F5).** El CDN de Shopify
sirve el asset viejo durante un rato y parece un fallo de la app.

**El `[error] AssetSizeAppBlockJavaScript` de `shopify app build` es un falso
positivo conocido.** Mide el archivo crudo; el límite real de Shopify es sobre el
comprimido. El control de verdad está en `scripts/build-theme.mjs`.

---

## Qué es Lovelist

App pública de Shopify que permite a los compradores de una tienda guardar productos
como favoritos, organizarlos en listas, y compartir esas listas para que otras personas
puedan comprarlas.

**Un solo plan: $29/mes.** Sin plan gratuito. Sin período de prueba en el MVP.

---

## Reglas técnicas no negociables

Vienen de otra app mía ya en producción. No cambiarlas sin avisarme primero.

| Regla | Detalle |
|---|---|
| Framework | React Router v7, framework mode, SSR |
| Lenguaje | TypeScript |
| Base de datos | Prisma + PostgreSQL (Neon), `DATABASE_URL` pooled + `DIRECT_URL` directo |
| Adaptador Prisma | **NO** usar `@prisma/adapter-neon`. Runtime Node.js, provider `postgresql` estándar |
| Hosting | Vercel, `vercel.json` con `{ "framework": "react-router" }` |
| Imports | **Siempre relativos.** No definir ni usar el alias `~` — rompe el build SSR de Rollup |
| UI admin | Polaris App Home web components (`s-page`, `s-section`) + App Bridge |
| HTML custom | Permitido dentro de `s-section` cuando los `s-*` no dan el control de layout necesario |
| Íconos admin | `lucide-react` |
| i18n | **Dos catálogos, y no se pueden unificar.** El admin y el servidor usan un objeto TypeScript plano en `app/i18n.ts`; el storefront usa `extensions/lovelist-theme/locales/es.default.json`, porque la extensión es un bundle que nunca toca el servidor. Sin librería externa. Todo en español LATAM |
| Distribución | `AppDistribution.AppStore` |

### Reglas propias del storefront

| Regla | Detalle |
|---|---|
| JavaScript del tema | **Vanilla JS.** Sin React, sin jQuery, sin frameworks |
| Tamaño | El bundle del storefront debe quedar bajo 30 kB comprimido. Shopify además limita a **10 kB comprimidos** el JS referenciado por el schema de un app block (documentado como *suggested*). Manda el más chico de los dos. Ojo: theme check aplica esa cifra sobre el archivo **crudo**, así que marca error mucho antes; el control real está en `scripts/build-theme.mjs` |
| CSS | Todo prefijado con `lovelist-`. Cero estilos globales, cero `!important` salvo caso justificado y comentado |
| API | **Todo pasa por el App Proxy.** Nunca exponer el dominio de Vercel en el código del tema |
| Firma | Validar HMAC en **cada** request del proxy. Sin excepciones |
| Carga | El script no debe bloquear el render. Nada de `document.write` |

---

## Decisiones de producto (ya tomadas)

| Decisión | Valor |
|---|---|
| Listas por cliente | **Múltiples.** Una lista "Favoritos" se crea por defecto |
| Interfaz storefront | **Drawer lateral + página completa.** El drawer para consultar rápido, la página para gestionar y compartir |
| Qué se guarda | **`productId` obligatorio + `variantId` opcional.** Ver justificación abajo |
| Invitados | **Sí, sin login.** Con migración a la cuenta al iniciar sesión |
| Compartir | Link público, más botones de WhatsApp, email y copiar |
| Scopes | `read_products` únicamente |

### Por qué producto + variante

Para "añadir al carrito" desde la lista se necesita una variante — el carrito de Shopify
no acepta productos sueltos. Pero cuando el cliente da corazón desde una página de
colección no ha elegido talla ni color, así que ahí solo hay producto.

Con las dos columnas se cubren ambos casos: si hay `variantId` se usa; si no, se resuelve
la variante por defecto al momento de comprar. Guardar solo producto obliga a inventar la
variante al final; guardar solo variante rompe el corazón en colecciones.

### Por qué NO pedimos `read_customers`

El App Proxy inyecta `logged_in_customer_id` en cada request cuando el visitante tiene
sesión iniciada en el storefront. Eso alcanza para identificar al cliente y **no requiere
aprobación de Protected Customer Data**. Pedir `read_customers` metería la app en un
proceso de aprobación de semanas sin ganar nada.

**Consecuencia:** no tenemos nombre ni email del cliente. No los necesitamos. Si en el
futuro se quieren alertas por email (fase posterior), ahí sí habrá que pedir aprobación.

---

## Modelo de datos

Esto es la forma, no el schema literal. Ajustar nombres y tipos a lo que sea idiomático
en Prisma, pero respetar las relaciones y las restricciones marcadas.

```
Shop
  (ya existe)
  + settings        Json?     // NO guarda configuración visual: eso vive en los
                              // settings del app embed block. Ver Fase 2.5

Wishlist
  id                String    @id
  shopId            String    // FK a Shop
  customerId        String?   // el logged_in_customer_id de Shopify
  anonymousId       String?   // UUID para invitados
  name              String    // "Favoritos" por defecto
  isDefault         Boolean
  shareToken        String?   @unique  // null hasta que se comparte
  createdAt / updatedAt

  // Restricción: customerId XOR anonymousId — uno de los dos, nunca ambos ni ninguno

WishlistItem
  id                String    @id
  wishlistId        String    // FK a Wishlist, onDelete: Cascade
  productId         String    // gid://shopify/Product/...
  variantId         String?   // gid://shopify/ProductVariant/...
  addedAt           DateTime

  @@unique([wishlistId, productId, variantId])
```

### Notas sobre el modelo

- **`shareToken` empieza en `null`.** Solo se genera cuando el dueño pulsa "compartir".
  Una lista sin token no es accesible por link, ni siquiera adivinando el `id`.
- **El token debe ser criptográficamente aleatorio**, mínimo 32 caracteres. No usar el
  `id` de la lista ni nada derivado de él.
- **Nada de datos de producto en la base.** Ni título, ni precio, ni imagen. Todo eso se
  lee de Shopify en el momento de mostrar. Guardar copias significa mostrar precios viejos
  y productos borrados.
- **Índices necesarios:** `(shopId, customerId)`, `(shopId, anonymousId)`, `shareToken`.
- **No validamos contra Shopify que el producto exista al guardarlo.** Es deliberado, no
  un olvido. Guardar un favorito no puede depender de una llamada a la Admin API: sería
  lento en el peor momento (el clic del comprador) y fallaría cuando la API esté caída.
  La Fase 2.4 resuelve los productos al mostrarlos y oculta los que ya no existen, así
  que un ID inválido solo ensucia la lista de quien lo mandó.
- **El índice único de `WishlistItem` usa `NULLS NOT DISTINCT`.** En Postgres `NULL` nunca
  es igual a `NULL`, así que un único corriente **no** impediría guardar cien veces el
  mismo producto sin variante — que es justo el caso del corazón en colecciones. Requiere
  PG ≥ 15. Prisma no modela esa cláusula: vive en el SQL de la migración.
- **La identidad exclusiva (`customerId` XOR `anonymousId`) es un `CHECK` en la migración.**
  Prisma tampoco lo modela. Sin él se pueden crear listas sin dueño o con dos.

---

## Fases

### Fase 2.1 — Datos y API del proxy

Sin nada visual. Al terminar esto la app no se ve distinta, pero la tubería funciona.

**Qué hacer:**

1. Modelos de Prisma según el diseño de arriba, con su migración.
2. Endpoints bajo `/proxy`, todos con validación HMAC:

   | Método | Ruta | Qué hace |
   |---|---|---|
   | `GET` | `/proxy/lists` | Devuelve las listas del visitante con sus items |
   | `POST` | `/proxy/lists` | Crea una lista nueva |
   | `PATCH` | `/proxy/lists/:id` | Renombra una lista |
   | `DELETE` | `/proxy/lists/:id` | Borra una lista (la default no se puede borrar) |
   | `POST` | `/proxy/items` | Agrega producto a una lista |
   | `DELETE` | `/proxy/items/:id` | Quita un item |
   | `POST` | `/proxy/lists/:id/share` | Genera `shareToken` y devuelve la URL |

3. Resolución de identidad: si viene `logged_in_customer_id`, es cliente registrado. Si no,
   se usa el `anonymousId` que manda el cliente en el body. Si no hay ninguno, error 400.
4. Crear la lista "Favoritos" por defecto la primera vez que alguien guarda algo.

**Seguridad — esto es lo importante de esta fase:**

- **Verificar propiedad en cada operación.** Que el `customerId` o `anonymousId` del request
  sea dueño de la lista que se está tocando. Un cliente no puede leer ni modificar la lista
  de otro por adivinar un `id`.
- **Solo POST/PATCH/DELETE mutan.** Ningún GET debe cambiar estado.
- **Límite de escrituras por identidad.** Sugerido: 60 por minuto. Los invitados no tienen
  cuenta, así que sin esto cualquiera puede llenar la base.
- **Techo de items por lista** (sugerido 200) y **de listas por identidad** (sugerido 20).

**Cómo lo pruebo:** con `curl` o el navegador contra `/apps/lovelist/...`, y viendo las
filas aparecer en Neon.

---

### Fase 2.2 — Theme App Extension

La pieza más delicada del MVP, porque tiene que funcionar en temas que no controlamos.

**Qué hacer:**

1. **App embed block** (se activa desde el editor de temas, carga en todas las páginas):
   - El drawer lateral, oculto hasta que se abre
   - El contador del header
   - El JS y CSS compartidos
2. **App block** para la página de producto: el botón de corazón, que el merchant arrastra
   donde quiera dentro del tema.
3. **Inyección automática en colecciones.** Los app blocks no existen en las tarjetas de
   colección, así que el corazón ahí se inserta por JS. Debe:
   - Detectar las tarjetas de producto sin depender de clases de un tema específico
   - Manejar carga infinita y filtros AJAX (usar `MutationObserver`)
   - **Fallar en silencio si no encuentra dónde inyectar.** Nunca romper la página del tema
4. Estado optimista: el corazón se llena al instante, y si la petición falla se revierte
   con un mensaje.

**Cómo lo pruebo:** instalando el tema Dawn limpio, activando el embed, y dando corazón
en producto y en colección. Probar también en un tema distinto.

---

### Fase 2.3 — Invitados y migración a cuenta

**Qué hacer:**

1. Generar un `anonymousId` (UUID v4) la primera vez y guardarlo en `localStorage`.
2. Las listas de invitado se guardan **en el servidor**, no solo en `localStorage`. El
   `localStorage` guarda el UUID; los datos viven en la base. Esto es lo que permite que
   un invitado pueda compartir su lista.
3. Al detectar que el visitante inició sesión (`logged_in_customer_id` presente y hay un
   `anonymousId` en `localStorage`), **fusionar**:
   - Los items de las listas anónimas pasan a las listas del cliente
   - Los duplicados se descartan sin error
   - Las listas anónimas se borran y el `anonymousId` se limpia del `localStorage`
   - **Fusionar, nunca reemplazar.** Si el cliente ya tenía cosas guardadas, no se pierden
4. La fusión debe ser idempotente: correrla dos veces no debe duplicar nada.

**Cómo lo pruebo:** guardo productos sin login, inicio sesión, y verifico que todo siga ahí
sumado a lo que ya tenía la cuenta.

---

### Fase 2.4 — Página completa y compartir

**Qué hacer:**

1. Página de la wishlist en `/apps/lovelist`, servida por el proxy. Debe devolver Liquid
   para que herede el layout del tema (header, footer, tipografías) — no un HTML suelto.
2. Contenido: selector de listas, grilla de productos con precio actual y disponibilidad,
   quitar item, añadir al carrito individual y "añadir todo al carrito".
3. **Compartir:** botón que genera el `shareToken` y devuelve
   `/apps/lovelist/shared/{token}`.
4. **Vista compartida:** la misma grilla pero en modo solo lectura, con "añadir al carrito"
   activo. Quien recibe el link puede comprar, no editar.
5. Botones de WhatsApp, email y copiar link.

**Detalles que importan:**

- Los productos borrados o despublicados **se ocultan**, no rompen la página.
- Los agotados se muestran marcados, con el botón de carrito desactivado.
- La vista compartida **no debe revelar nada del dueño** — ni ID, ni nombre, ni nada.
- `noindex` en la vista compartida. Las listas no deben salir en Google.

**Cómo lo pruebo:** comparto una lista, abro el link en incógnito, y compro desde ahí.

---

### Fase 2.5 — Configuración en el tema y admin

> **Alcance corregido el 2026-08-09.** La versión anterior guardaba la configuración
> visual en `Shop.settings` y pedía que "los cambios se vean en el storefront sin tocar
> el tema". Eso obligaba al JS del storefront a leer la configuración desde el servidor:
> una petición de red en cada página, parpadeo del ícono mientras llega —el mismo defecto
> que ya sufrimos al resolver handles— y más peso en un bundle que está al 68% de su
> límite. Se invierte: **lo visual son settings del app embed block**.

**La regla que ordena esta fase:** lo que el storefront necesita para pintarse va en el
app embed y se renderiza en Liquid; `Shop.settings` **no guarda configuración visual**.
La columna existe y queda libre para lo que el storefront no necesite leer.

**Qué hacer:**

1. **Settings del app embed block**, expuestos en el schema del bloque y renderizados en
   Liquid. Hoy estos valores están fijos en `theme-src/`; hay que sacarlos ahí:
   - Ícono: corazón o estrella
   - Estilo: relleno o línea
   - Color del ícono activo e inactivo
   - Texto del botón (o solo ícono)
   - Mostrar u ocultar el contador del header
2. **Dashboard** (`/app`): total de listas, total de items guardados, y los 10 productos
   más deseados con su conteo.
3. **`/app/settings`, en modo lectura.** Muestra la configuración vigente, con un enlace
   directo al editor de temas para cambiarla. No edita nada.
4. **Instrucciones de instalación** en esa misma pantalla: cómo activar el app embed y
   cómo colocar el bloque en la página de producto. Es donde los merchants se pierden.
5. **Soporte** (`/app/support`): datos de contacto reales y enlace a la documentación.

**Detalles que importan:**

- **Cero JS nuevo en el storefront por la configuración.** Si en la implementación aparece
  la necesidad de pedir algo por red para pintarse, es señal de que algo se salió de este
  diseño: decírmelo y parar.
- Los valores por defecto del schema deben ser los que hoy están fijos en el código, así
  que un merchant que no toca nada ve exactamente lo mismo que ahora.
- Si un valor de configuración falta o es inválido, se usa el de por defecto. Aplica la
  regla del storefront: fallar en silencio, nunca romper el tema.

**Cómo lo pruebo:** en el editor de temas cambio el ícono a estrella, guardo, recargo la
tienda con Ctrl+F5, y veo estrellas. Después abro `/app/settings` y confirmo que refleja
"estrella" y que el enlace me lleva al editor.

---

### Fase 2.6 — Cobro

**Shopify Managed Pricing.** La app no crea suscripciones ni toca dinero: Shopify muestra
la página de precios, cobra, y gestiona altas y bajas. La app solo *lee* qué plan tiene
cada tienda.

**Qué hacer:**

1. Un solo plan: handle `pro`, $29/mes, sin trial.
2. Pantalla `/app/plans` con el botón hacia
   `https://admin.shopify.com/store/{shop}/charges/{appHandle}/pricing_plans`.
   El `appHandle` debe venir de variable de entorno **y estar definida** — no de un valor
   de reserva escrito en el código.
3. Sondeo contra `currentAppInstallation.activeSubscriptions` (**plural** — el singular no
   existe en la API), leyendo **`planHandle`, no `name`** (el nombre viene traducido al
   idioma de la tienda y el mapeo falla en tiendas no inglesas).
4. Ruta de retorno `/app/plans/confirm`.
5. **Paywall duro:** sin suscripción activa, el storefront no guarda favoritos y el admin
   muestra la pantalla de planes. El merchant ve exactamente qué pierde.

**Dos cosas que en mi otra app salieron mal y aquí van bien desde el principio:**

- **`/confirm` debe verificar contra Shopify.** En mi otra app escribe el plan directamente
  desde `?plan_handle=` sin comprobar nada, así que cualquier merchant autenticado se sube
  de plan con solo visitar una URL. Aquí el `plan_handle` se usa **como pista**, y el plan
  solo se escribe si `activeSubscriptions` confirma la suscripción.
- **La salvaguarda anti-degradación debe distinguir "no sé" de "no tiene".** Regla: ante
  error de API o handle desconocido, **conservar** el plan. Pero si la respuesta viene
  **sin errores** y con `activeSubscriptions: []`, eso es una confirmación de que no hay
  suscripción, no una ambigüedad — ahí sí se baja. Sin esto, una cancelación no se refleja
  nunca y el merchant conserva el plan pagado para siempre.
- **Nada de `catch` que solo hace `console.error`.** Un fallo silencioso en el sondeo
  convierte un error puntual en un error permanente que nadie ve.

**Cómo lo pruebo:** instalo en una tienda de desarrollo sin suscripción y confirmo que el
paywall bloquea; suscribo y confirmo que se abre.

---

## Fuera del alcance del MVP

Esto se construye después de publicar. No adelantarlo.

- Alertas de vuelta a stock
- Avisos de bajada de precio
- Emails de recordatorio
- Registro de regalos / listas de boda
- Analítica avanzada y exportación
- Multiidioma
- Integraciones con Klaviyo, Mailchimp, etc.
- App Bridge para POS

---

## Requisitos de app pública

A tener presente durante todas las fases, no como paso final:

- **Webhooks GDPR funcionando de verdad**, no stubs. `customers/redact` debe borrar las
  listas de ese cliente. `shop/redact` debe borrar todo lo de esa tienda.
- **`app/uninstalled`** debe limpiar sesiones y marcar la tienda como desinstalada.
- **Sin datos personales.** No guardamos nombre, email ni dirección de nadie. Solo IDs.
- **Rendimiento del storefront:** la app no puede degradar el Core Web Vitals de la tienda.
  Es criterio de revisión de Shopify.
- **Manejo de errores visible.** Si algo falla, el usuario ve un mensaje en español, no una
  pantalla en blanco.
- **Ningún texto suelto en los componentes**, ni de cara al merchant ni al comprador. Van
  en su catálogo: `app/i18n.ts` para el admin y el servidor,
  `extensions/lovelist-theme/locales/es.default.json` para el storefront. Son dos y así
  se quedan — ver la regla de i18n más arriba. Un solo idioma: español LATAM. **No agregar
  otro archivo de locales**, ni siquiera "por si acaso": ya causó un bug (el drawer salió
  en inglés porque existía un `en.json` que nadie pidió; ver 4.5 de `BITACORA.md`).

---

## Cosas que quiero que me digas, no que resuelvas solo

- Si una decisión de este documento te parece equivocada al implementarla
- Si una fase necesita un scope de Shopify que no está en `read_products`
- Si algo requiere aprobación de Protected Customer Data
- Si el bundle del storefront se pasa de 30 kB
- Si hay que instalar una dependencia nueva que no sea trivial
- Si encuentras un problema en la Fase 1 que hay que arreglar antes de seguir

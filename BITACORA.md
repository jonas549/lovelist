# Bitácora de Lovelist

> Escrita el 2026-08-08 al cerrar la primera sesión de trabajo.
> Corregida el 2026-08-09: decía que Jonas había probado la Fase 2.4 hasta el
> paso 6 de 7. Es falso, no probó ninguno. Ver secciones 1 y 7.
>
> Este documento existe para que otra instancia, sin ningún contexto previo,
> pueda retomar exactamente donde quedamos. No es un resumen: es el registro de
> lo que se construyó, por qué se decidió así, y —sobre todo— qué salió mal y
> qué lección dejó.
>
> La fuente de verdad del **qué hay que hacer** es `PLAN-MVP.md`. Esta bitácora
> es la fuente de verdad del **cómo llegamos hasta acá**.

---

## 1. Estado del proyecto

Lovelist es una app pública de Shopify que permite a los compradores guardar
productos como favoritos, organizarlos en listas y compartirlas. Un solo plan de
$29/mes, sin plan gratuito ni prueba.

### Fases terminadas

| Fase | Qué entregó | Commit de cierre | ¿Probada en tienda? |
|---|---|---|---|
| 1 | Cascarón desplegado: app creada, Neon, App Proxy, HMAC verificado | `3bac714`, más `32e0ee7` y `d57a664` | sí |
| 2.1 | Modelo de datos y los endpoints del proxy | `b58c5be`, más `801b909` | sí |
| 2.2 | Theme app extension: embed, botón, inyección en colecciones | `6d64965`, más `25dfe61` | sí |
| 2.3 | Invitados y fusión con la cuenta al iniciar sesión | `374b7a0` | sí |
| 2.4 | Página completa, compartir, y resolución de productos en el servidor | `b057fc7` | **no, pendiente** |

Las fases 1 y 2.2 necesitaron un commit extra de corrección **después** de que
Jonas probara en la tienda real. Eso no es excepción: es el patrón. Ver la
sección 4.

**La 2.4 está entregada pero sin verificar.** La sesión se cortó justo al
entregarla, así que no se ejecutó ninguno de sus pasos de verificación. Por el
patrón de arriba, lo esperable es que necesite un commit de corrección. Ver la
sección 7.

### Qué está probado y dónde

Esta distinción importa. No todo lo que pasa las pruebas funciona en la tienda.

**Probado en la tienda real por Jonas (`calendario-envios-test-final`):**

- Instalación de la app y admin embebido
- `/apps/lovelist/ping` responde con firma válida
- Corazones en páginas de colección, que persisten tras recargar
- Contador en el header de Dawn
- Drawer con los productos correctos
- Que el banner "Stay hydrated" ya **no** recibe corazón
- Fusión de invitado a cuenta: guardó 2 productos en incógnito, inició sesión,
  los 2 siguen ahí, recargó y no cambió nada, el `anonymousId` desapareció de
  `localStorage`
- Que el App Proxy reenvía `PATCH` y `DELETE` nativos

**Probado contra la base de Neon real y la Admin API real, pero no en la tienda:**

- Los endpoints del proxy, con firma HMAC generada por la implementación
  oficial de Shopify (35 comprobaciones)
- Los constraints de la base: XOR de identidad, `NULLS NOT DISTINCT`, cascadas
  (8 comprobaciones)
- Los webhooks de privacidad, ejecutando las rutas reales con firma válida
  (25 comprobaciones)
- La fusión de invitado, incluyendo aislamiento entre tiendas y clientes
  (21 comprobaciones)
- La resolución de productos y la vista compartida (30 comprobaciones)

**Probado solo en el banco de pruebas del navegador** (`npm run test:theme`):

- Detección de tarjetas en cinco formas de marcado distintas
- Estado optimista y reversión ante fallo de red
- Página completa: grilla, carrito, compartir, quitar

**Sin probar en la tienda real: la Fase 2.4 entera.** Ni la página
`/apps/lovelist`, ni la vista compartida, ni el ocultamiento de productos
despublicados. Los siete pasos de verificación quedaron sin ejecutar: la sesión
terminó en el momento de la entrega. Ver sección 7.

---

## 2. Infraestructura y accesos

| Qué | Valor |
|---|---|
| Repo | `https://github.com/jonas549/lovelist` (rama `main`) |
| Carpeta local | `C:\Users\Jonas\Documents\App favoritos\lovelist` |
| Hosting | Vercel, `https://lovelist-bay.vercel.app` |
| Base de datos | Neon, PostgreSQL 17.10, endpoint `ep-fancy-dawn-awszn59w` (región `us-east-1`) |
| Org de Partners | `appsdevelopers`, id `193860913` |
| App en el dashboard | id `408224923649` |
| `client_id` / API key | `6b6447890b5972fb101a60cb7082e182` (es público: va en el frontend) |
| Handle de la app | `lovelist` |
| Tienda de desarrollo | `calendario-envios-test-final.myshopify.com`, tema Dawn |
| App Proxy | `/apps/lovelist` → `https://lovelist-bay.vercel.app/proxy` |
| Versión de la API | `2026-10` |
| Scopes | `read_products`, y nada más |

### Variables de entorno

Los valores **no están en el repo**. Viven en dos lugares y hay que mantenerlos
sincronizados a mano.

| Variable | Local (`.env`, ignorado por git) | Vercel | Para qué |
|---|---|---|---|
| `SHOPIFY_API_KEY` | sí | sí | identifica la app |
| `SHOPIFY_API_SECRET` | sí | sí | firma del App Proxy y de los webhooks |
| `SCOPES` | sí | sí | `read_products` |
| `SHOPIFY_APP_URL` | no hace falta | **sí** | la usa `shopifyApp()` en runtime |
| `DATABASE_URL` | sí | sí | Neon **pooled** (el host lleva `-pooler`) |
| `DIRECT_URL` | sí | opcional | Neon **directo**, solo lo usa `prisma migrate` |

`DIRECT_URL` se comprobó que **no hace falta en runtime**: se instanció
`PrismaClient` con la variable desactivada y las consultas funcionaron.

Hay un archivo de ayuda en `C:\Users\Jonas\Documents\App favoritos\vercel-env.txt`
—fuera del repo— con las seis variables listas para pegar en el importador
masivo de Vercel.

### Herramientas del entorno

- Shopify CLI 4.6.1 global, ya autenticado
- Node 24.18.1, npm 11.16.0
- **No hay `gh` CLI.** Los repos y PRs los crea Jonas a mano
- Git tiene identidad configurada solo a nivel de este repo

---

## 3. Arquitectura, y por qué

### El reparto: Vercel + extensión de tema

La app son dos piezas que **nunca se conocen directamente**:

1. **La app en Vercel** (React Router v7, SSR): el admin embebido, los endpoints
   del App Proxy, los webhooks. Tiene el token de la tienda y la base.
2. **La theme app extension**: JavaScript y CSS que corren en el storefront,
   servidos desde el CDN de Shopify.

El storefront **jamás** habla con `lovelist-bay.vercel.app`. Todo su tráfico va
a `/apps/lovelist/...`, que es una ruta del dominio de la tienda.

### Por qué el App Proxy y no llamadas directas

Tres razones, en orden de peso:

1. **Identidad sin pedir permisos.** El proxy inyecta `logged_in_customer_id`
   firmado en cada request cuando el visitante tiene sesión en el storefront.
   Eso identifica al cliente sin que la app pida ningún scope de clientes.
2. **Mismo origen.** Sin CORS, sin preflight, sin cookies de terceros. Y el
   dominio de la app no aparece en el código del tema, así que no hay nada que
   un merchant pueda copiar mal.
3. **Firma verificable.** Shopify firma la query string con el client secret.
   Cualquier petición que no venga por el proxy se rechaza.

### Por qué NO pedimos `read_customers`

Es la decisión de producto con más consecuencias técnicas del proyecto.

`logged_in_customer_id` **no requiere aprobación de Protected Customer Data**.
Pedir `read_customers` metería la app en un proceso de revisión de semanas sin
ganar nada para el MVP.

**Consecuencia:** no tenemos nombre ni email de nadie. Solo IDs numéricos. Si
alguna vez se quieren alertas por email, ahí sí habrá que pedir aprobación.

### Por qué los datos de producto no se guardan

La base guarda **solo IDs**: `gid://shopify/Product/...` y opcionalmente
`gid://shopify/ProductVariant/...`. Ni título, ni precio, ni imagen.

Guardar copias significaría mostrar precios viejos y productos borrados. Todo se
lee de Shopify en el momento de mostrar.

Esto tuvo un costo real que tardó dos fases en resolverse bien: el storefront no
puede pedir un producto por ID sin credenciales. En la 2.2 se parcheó con un
caché `handle → productId` en `localStorage`, que se perdía entre dispositivos.
En la 2.4 se resolvió de verdad: el **servidor** consulta la Admin API con el
token offline (`unauthenticated.admin(shop)`) y devuelve los datos.

**El caché de handles sigue existiendo, pero con otro propósito.** No confundir:

- `localStorage["lovelist_handles"]` mapea `handle → productId` y sirve para
  **pintar los corazones** en tarjetas de colección, donde el DOM solo trae el
  handle. Es una relación inmutable, cachearla es seguro.
- `POST /proxy/products` devuelve título, precio, imagen y disponibilidad, y
  sirve para **mostrar** productos en el drawer y en la página. Se pide bajo
  demanda porque cada llamada gasta cuota de la Admin API.

### Por qué producto + variante

Para "añadir al carrito" hace falta una variante: el carrito de Shopify no
acepta productos sueltos. Pero cuando alguien da corazón desde una colección no
eligió talla ni color.

Con las dos columnas se cubren los dos casos. Si hay `variantId` se usa; si no,
el servidor resuelve la primera variante vendible al mostrar.

### Identidad: invitados y clientes

- **Cliente registrado:** `customerId` = el `logged_in_customer_id` del proxy.
- **Invitado:** `anonymousId` = un UUID v4 que genera el navegador y guarda en
  `localStorage`.

La restricción es **XOR**: una lista tiene uno de los dos, nunca los dos ni
ninguno. Prisma no sabe expresarlo, así que es un `CHECK` en la migración.

**Nota de seguridad que hay que tener presente:** el `anonymousId` es un
portador (bearer). La firma del proxy prueba que la petición pasó por Shopify,
no que quien la manda sea dueño de ese UUID. Es aceptable porque son 122 bits al
azar, pero hay que tratarlo como secreto. La misma exposición aplica a
`/proxy/merge`: quien conozca un `anonymousId` ajeno puede absorber esas listas
a su cuenta. No lo empeora, porque con ese UUID ya podría leerlas y editarlas.

### Modelo de datos

```
Shop          domain (unique), currency, plan, planActivatedAt, lastSyncAt,
              settings (Json), uninstalledAt
Wishlist      shopId, customerId?, anonymousId?, name, isDefault, shareToken?
WishlistItem  wishlistId, productId, variantId?, addedAt
RateLimit     key, windowStart, count
Session       (la del template de Shopify)
```

Tres migraciones: `20260808120000_init`, `20260808160000_wishlists`,
`20260808173000_gdpr`.

### Los endpoints del proxy

| Método | Ruta | Qué hace |
|---|---|---|
| `GET` | `/proxy/ping` | diagnóstico: valida firma y nada más |
| `GET` | `/proxy` | la página de favoritos, en Liquid (solo el armazón) |
| `GET` | `/proxy/shared/:token` | vista compartida, renderizada entera en el servidor |
| `GET` | `/proxy/lists` | listas del visitante con sus items |
| `POST` | `/proxy/lists` | crear lista |
| `PATCH` | `/proxy/lists/:id` | renombrar |
| `DELETE` | `/proxy/lists/:id` | borrar (la predeterminada no se puede) |
| `POST` | `/proxy/lists/:id/share` | genera `shareToken`, idempotente |
| `POST` | `/proxy/items` | agregar producto |
| `DELETE` | `/proxy/items/:id` | quitar |
| `POST` | `/proxy/merge` | fusionar listas de invitado con la cuenta |
| `POST` | `/proxy/products` | datos de producto de **mis** listas |

`/proxy/products` es POST y no GET porque los invitados mandan su `anonymousId`
en el cuerpo, pero no muta nada. **No recibe qué productos pedir**: resuelve los
de las listas de quien pregunta. Aceptar una lista de IDs del cliente lo
convertiría en un lector de catálogo para cualquiera que sepa firmar.

### Topes activos

- 20 listas por identidad
- 200 items por lista
- 60 escrituras por minuto por identidad, con ventana fija en Postgres resuelta
  en un `INSERT ... ON CONFLICT` atómico, más limpieza oportunista de ventanas
  vencidas (2% de las escrituras, con `LIMIT 200`)

**Limitación conocida:** el límite por identidad no frena a un atacante
decidido, porque el `anonymousId` lo genera el cliente y puede rotarlo. Frena el
abuso accidental y el scripting ingenuo. Un tope global por tienda sería el
respaldo, pero es decisión de producto y no se tomó.

### Por qué la página devuelve Liquid

Cuando el proxy responde con `Content-Type: application/liquid`, Shopify pasa el
cuerpo por Liquid y lo mete dentro del layout del tema. Por eso la página hereda
header, footer y tipografías sin replicar nada.

**Esto trae un riesgo de inyección que hay que respetar siempre:** el cuerpo lo
evalúa Liquid **antes** de llegar al navegador. Un nombre de lista como
`{{ shop.email }}` se ejecutaría. `escaparLiquid()` en `app/liquid.server.ts`
neutraliza la llave de apertura como entidad (`&#123;`): Liquid nunca ve `{{`, y
el navegador la decodifica después, así que en pantalla se lee igual.

### Por qué la página propia se renderiza en el cliente y la compartida no

- `/apps/lovelist` manda **solo el armazón**. La identidad de un invitado vive
  en su `localStorage` y el servidor no la tiene en una navegación normal.
- `/apps/lovelist/shared/:token` va **entera del servidor**. Ahí el token
  identifica la lista, así que funciona en el primer render, sin JS, para
  alguien que abre el link desde WhatsApp. Que ese caso funcione sin JavaScript
  es justamente el punto de compartir.

### Reglas del código del storefront

- Vanilla JS, sin frameworks
- Todo el CSS prefijado con `lovelist-`, cero estilos globales, cero
  `!important`
- **Si algo no se puede hacer, se falla en silencio.** Estamos dentro del tema
  de otra persona: romperle la tienda es peor que no mostrar un corazón
- Los textos del storefront viven en `extensions/lovelist-theme/locales/`, **no**
  en `app/i18n.ts`. Son dos catálogos separados y no hay forma de unificarlos: la
  extensión es un bundle que nunca toca el servidor

---

## 4. Los errores de esta sesión

Esta es la sección más importante del documento. Cada uno costó tiempo real y
casi todos tienen una causa distinta de la que aparentaban.

---

### 4.1 El `vercel.json` decía `"remix"` en vez de `"react-router"`

**Cómo se manifestó.** El deploy en Vercel fallaba y el log se cortaba justo
después de `postinstall > prisma generate`. Jonas sospechaba de las variables de
entorno de Shopify.

**Causa real.** No eran las variables. Los dos slugs comparten el mismo builder
(`@vercel/remix-builder`), pero el builder ramifica por el string exacto:

```js
const frameworkSettings = config.framework === "react-router"
  ? REACT_ROUTER_FRAMEWORK_SETTINGS
  : REMIX_FRAMEWORK_SETTINGS;
```

Con `"remix"` caía en la rama que espera `@remix-run/dev`, `remix build` y
`@remix-run/dev/server-build`. El proyecto es React Router v7: tiene
`@react-router/dev` y expone `virtual:react-router/server-build`. Nada resolvía.

El valor venía de otra app de Jonas ya en producción, que está sobre el template
de Remix anterior. La regla no transfería.

**Cómo se arregló.** `{ "framework": "react-router" }`. Además se endureció
`vite.config.ts`: un `SHOPIFY_APP_URL` sin protocolo tiraba
`TypeError: Invalid URL` desde un `new URL()` de nivel de módulo y mataba el
build con un mensaje que no apunta a nada.

**Lección.** Cuando el log se corta, el problema suele estar **después** de la
última línea, no en ella. Y una restricción heredada de otro proyecto hay que
verificarla contra este, no asumirla. La evidencia salió de leer el código del
builder en `node_modules`, no de suponer.

---

### 4.2 Los corazones no persistían al recargar

**Cómo se manifestó.** Se marcaba un corazón, se llenaba, se recargaba la página
y volvía a salir vacío. La hipótesis natural era que el guardado no llegaba al
servidor, o que el `anonymousId` se regeneraba en cada carga.

**Causa real.** Ninguna de las dos. El servidor **sí** tenía el item guardado
(`gid://shopify/Product/8994073673864`) y el `anonymousId` **sí** persistía. Lo
que nunca podía funcionar era el **pintado**.

En Dawn, las tarjetas de colección no exponen el ID del producto en el DOM. El
botón inyectado solo tenía el handle, y `pintarBoton` salía temprano cuando
faltaba el ID:

```js
var pid = btn.getAttribute("data-lovelist-producto");
if (!pid) return;   // <- acá moría, siempre
```

En una página de colección de Dawn **ningún corazón podía llenarse jamás**.

**Cómo se arregló.** Caché persistente `handle → productId` en `localStorage`.
Lo cacheado se pinta sin red; lo que falta se resuelve contra
`/products/{handle}.js`, de a 4 y con techo de 40 por carga. Si el visitante no
tiene nada guardado, cero peticiones: no habría nada que pintar.

**Lección.** El síntoma dijo "no guarda" y la causa era "no pinta". Antes de
tocar código hubo que ir al DOM de la tienda real y mirar el estado: los 16
botones tenían `data-lovelist-producto: null`. Diagnosticar sobre la tienda en
vivo evitó reescribir la parte que funcionaba bien.

---

### 4.3 El contador no aparecía en ningún lado

**Cómo se manifestó.** Ni en el header ni flotante abajo a la derecha. Se había
prometido que si no encontraba el carrito caía al modo flotante, y no pasaba
ninguna de las dos.

**Causa real.** El contador **estaba en el DOM**, dentro del menú móvil plegado
de Dawn (`menu-drawer__menu`, sin renderizar). El selector se quedaba con el
primer enlace a `/cart` en orden del documento, y Dawn tiene **cinco**: el
primero vive en un cajón que nadie abre.

**Cómo se arregló.** Tres capas:

1. Filtrar por visibilidad real (`getClientRects().length > 0` **y** comprobar
   `visibility`/`display` computados, porque `visibility:hidden` sigue
   devolviendo cajas)
2. Entre los visibles, preferir el que contenga un `<svg>` o `<img>`: ese es el
   grupo de iconos del header. Mirar si tiene icono funciona en cualquier tema;
   mirar clases, no
3. Después de insertarlo, comprobar que se ve; si no, pasar a flotante

**Lección.** "Existe en el DOM" y "el usuario lo ve" son dos cosas distintas, y
las pruebas comprobaban la primera. El respaldo tampoco se activaba porque el
código creía haber tenido éxito.

---

### 4.4 Un corazón encima del banner "Stay hydrated"

**Cómo se manifestó.** En la home, una sección de imagen con texto que enlaza a
un producto recibió un corazón arriba a la derecha.

**Causa real.** La heurística era "un contenedor con imagen que enlaza
exactamente un producto es una tarjeta". Los banners promocionales, las
secciones de imagen con texto y los bloques destacados cumplen exactamente esa
forma.

**Cómo se arregló.** Se exige una segunda señal: que el contenedor tenga
hermanos de la misma forma (o sea, que viva en una grilla) **o** que muestre un
precio. Un banner no cumple ninguna.

Verificado contra la home real: de once contenedores candidatos, el único
rechazado es el banner; las diez tarjetas de producto pasan.

**Lección.** Una heurística que reconoce bien lo que buscás no necesariamente
rechaza bien lo que no. El banco de pruebas tenía casos de "esto sí es una
tarjeta" y de "esto obviamente no lo es" (un enlace de texto), pero ninguno de
"esto se parece mucho pero no lo es". Ese es el caso que hay que escribir.

---

### 4.5 El drawer en inglés

**Cómo se manifestó.** El drawer mostraba "My wishlist". Jonas lo reportó como
bug: un merchant hispano no debería ver inglés sin tocar nada.

**Causa real.** No era Shopify eligiendo mal. En la Fase 2.2 se había agregado
`locales/en.json` por iniciativa propia, sin que nadie lo pidiera. La tienda de
desarrollo está en inglés, así que Shopify servía ese catálogo — comportándose
exactamente como debe.

El plan dice "todo en español LATAM" y pone multiidioma **fuera del alcance del
MVP**. Ese archivo nunca debió existir.

**Cómo se arregló.** Se borró. Al quedar solo `es.default.json`, y por ser el
`.default`, Shopify lo sirve para cualquier idioma de tienda.

**Lección.** Agregar algo "por si acaso" que el plan excluye explícitamente no es
neutral: creó un bug. Cuando el plan dice que algo está fuera de alcance, está
fuera de alcance también en su forma preparatoria.

---

### 4.6 `onlineStoreUrl` vuelve `null` en tiendas con contraseña

**Cómo se manifestó.** La prueba de resolución de productos falló con
"productos reales disponibles: 0", aunque la tienda tiene productos activos y
visibles.

**Causa real.** Para filtrar productos despublicados se usaba `onlineStoreUrl`,
que parece el campo obvio. Volvió `null` en los cinco productos, todos `ACTIVE` y
con `publishedAt`. Pasa en cuanto la tienda tiene contraseña — **todas las de
desarrollo la tienen**.

El filtro habría escondido el catálogo entero. En producción, la página de
favoritos habría aparecido vacía para todo el mundo.

**Cómo se arregló.** El filtro va por `publishedAt`, que es la fecha de
publicación en el canal Online Store. La URL se arma con el handle, que siempre
está.

**Lección.** Este no lo habría encontrado ninguna prueba con datos inventados.
Apareció porque la prueba corría contra la Admin API real de la tienda. Cuando
hay credenciales disponibles, probar contra el servicio real vale más que
cualquier mock.

---

### 4.7 Capturar el error de unicidad dentro de una transacción de Postgres

**Cómo se manifestó.** No llegó a manifestarse: se detectó al diseñar la fusión
de la Fase 2.3.

**Causa real.** El camino "obvio" para descartar duplicados al fusionar era
intentar mover cada item y capturar el `P2002` del índice único. Dentro de una
transacción de Postgres eso **deja la transacción abortada**: todo lo que sigue
falla con "current transaction is aborted". Sin savepoints —que Prisma no
expone— no hay forma de seguir.

**Cómo se arregló.** Los duplicados se detectan comparando en memoria contra los
items que ya tiene el destino, antes de escribir. Determinista y sin
excepciones.

Fuera de transacción el patrón `create` + capturar `P2002` **sí** se usa, y es
el correcto para el alta de items: es atómico y hace el alta idempotente.

**Lección.** El mismo patrón puede ser correcto en un contexto e imposible en
otro. Y hay un detalle relacionado: el `upsert` compuesto de Prisma **rechaza
`variantId: null`** en el `where`, así que para items sin variante no sirve.

---

### 4.8 El caché del CDN de Shopify nos hizo perder una ronda entera

**Cómo se manifestó.** Jonas probó la Fase 2.2 corregida y reportó que seguía
rota. Se diagnosticó, se pidieron datos, se planteó investigación. Después
avisó: era caché. Con recarga forzada andaba.

**Causa real.** Después de `shopify app deploy`, el CDN de Shopify sigue
sirviendo el asset viejo durante un rato. La app estaba bien.

**Cómo se arregló.** Nada que arreglar en el código. Quedó guardado como
preferencia de trabajo: en cada entrega que toque `theme-src/` o `extensions/`,
el paso de recarga forzada va **antes** de la lista de verificación, no como
nota al pie.

**Lección.** Un paso de verificación mal ordenado cuesta tanto como un bug. Si
sé que existe un modo de fallo ambiental que imita un fallo real, mencionarlo
después de la lista de pruebas es mencionarlo tarde.

---

### 4.10 `sections: null` — el App Proxy no renderiza secciones del tema

**Cómo se manifestó.** Los productos entraban bien al carrito, con la variante
y el precio correctos, pero el panel lateral de Dawn no se abría solo. Se caía
al respaldo sin que nadie se enterara. Costó **tres entregas**.

**Causa real.** `POST /cart/add.js` acepta un parámetro `sections_url` que dice
en qué contexto renderizar las secciones pedidas. Se le mandaba
`window.location.pathname`, que en la página de favoritos es `/apps/lovelist`
—una ruta del App Proxy, que no es una plantilla del tema—. Shopify responde
con la clave `sections` presente pero en **`null`**, Dawn hace
`parsedState.sections['cart-drawer']` y tira `Cannot read properties of null`.

Lo difícil de ver es que **el mismo pedido por otros caminos sí funciona sobre
esa misma ruta**: un `GET /apps/lovelist?sections=...` devuelve el HTML, y
`/cart/update.js` con ese `sections_url` también. Solo `add.js` falla ahí. Por
eso las comprobaciones previas daban verde: probaban el mecanismo por caminos
que no eran el que usa el código.

Aislado con cuatro variantes del mismo pedido contra la tienda real:

| `sections_url` | Resultado |
|---|---|
| `/apps/lovelist` | `sections: null` |
| omitido (usa la página actual) | `sections: null` |
| omitido, con `sections` como string | `sections: null` |
| `/` | funciona |

**Cómo se arregló.** `sections_url` fijo en `/`. Lo que muestra el panel
depende del carrito, no de dónde estaba parado el comprador, así que la raíz
sirve para todas las páginas y elimina la clase entera de casos borde.

Además se dejó de atrapar el fallo en silencio: si las secciones no vinieron,
se va a `/cart` en vez de mostrar un cartelito. Y se quitaron dos cosas que
eran aproximaciones: el despacho de `cart:update`/`cart:refresh` por si algún
tema escuchaba —no se podía verificar contra ningún tema disponible— y el
aviso propio al pie, que era ilegible.

**Lección.** Un `try/catch` que registra y sigue convierte un fallo ruidoso en
uno invisible: el error estaba en la consola desde el primer día. Y cuando se
integra con algo ajeno, hay que probar **el camino exacto que usa el código**,
no un camino parecido; acá tres pruebas del mecanismo daban verde mientras la
única llamada que importaba fallaba.

---

### 4.11 El panel se abría vacío, y la prueba corrió sobre un estado sucio

**Cómo se manifestó.** Arreglado lo de 4.10, el panel del tema por fin se abría
solo… pero llegaba vacío. Se veía el subtotal correcto y el botón "Ver carrito",
y todo el resto en blanco. En `/cart` los productos sí estaban.

**Causa real.** El contenido llegaba bien. Lo escondía el CSS.

La respuesta de Shopify traía la sección completa, con su fila de producto, y
esa fila **entraba al DOM en vivo**. Pero el elemento `<cart-drawer>` conservaba
la clase `is-empty` de cuando la página se había cargado con el carrito vacío, y
Dawn tiene estas reglas:

```css
cart-drawer.is-empty .drawer__header { display: none; }
.is-empty .cart__contents            { display: none; }
```

Esconden el encabezado y los productos, **y no tocan el pie**: por eso se veía el
subtotal y nada más. La clase vive en el **host**, por fuera de `#CartDrawer`,
que es lo único que `renderContents` reemplaza. Nunca se limpiaba.

`cart-drawer.js` intenta quitarla de `.drawer__inner` —el elemento equivocado en
esta versión del tema—, así que dentro del panel esa limpieza no ocurre nunca.

**Por qué el botón del propio Dawn sí funciona.** Se probó: con el carrito
vacío, el "Add to cart" del tema llena el panel bien. La diferencia está en
`product-form.js`:

```js
this.cart && this.cart.classList.contains("is-empty") && this.cart.classList.remove("is-empty")
```

**Quien limpia la clase es el llamador, no `renderContents`.** Nosotros
llamábamos a `renderContents` y nos salteábamos la otra mitad del contrato.

**Cómo se arregló.** Esa misma línea antes de renderizar. No es adivinar un
selector interno: es completar el contrato que el propio tema implementa en su
flujo de agregar al carrito. En un tema que no use esa clase, quitar algo que no
está no hace nada.

**La lección, y es la más cara de la sesión.** El fallo **solo aparece si el
carrito estaba vacío al cargar la página**. Cuando se verificó el arreglo
anterior, la prueba corrió con productos que las pruebas previas habían dejado
en el carrito, así que el host no tenía `is-empty` y el panel se llenó perfecto.

> **Verificar desde el estado inicial limpio, no desde el que dejó la prueba
> anterior.** Una prueba que corre sobre su propia basura confirma el camino que
> ya funcionaba y deja pasar justo el que importa.

Y acá el estado sucio escondía el peor caso posible: el carrito vacío es la
situación normal del comprador que agrega su primer producto.

El banco tampoco podía cazarlo, por lo mismo: el doble del `cart-drawer` no
modelaba `is-empty` ni el CSS que la usa. Ahora arranca con la clase puesta y la
comprobación mira **lo que ve el comprador** —que el producto tenga alto en
pantalla— y no que el atributo se haya quitado.

---

### 4.12 El favorito con el producto de uno y la variante de otro

**Cómo se manifestó.** Una lista con Red Wing ($310) y Dawson ($278) mostraba
Red Wing a **$250**, que es el precio de Antique Drawers — un producto que ni
siquiera estaba en la lista. "Agregar al carrito" en Red Wing metía Antique
Drawers. "Agregar todo" metía Antique y Dawson.

Se leía como "las tarjetas resuelven al producto equivocado", y la hipótesis
natural —la de Jonas y la mía— era un caché que no se invalidaba al quitar un
favorito. **Era falsa**: quitar items no reproduce nada, y armar listas desde
cero tampoco. Por eso no se pudo reproducir durante dos rondas.

**Causa real, en dos mitades.**

*Cómo se creaba la fila mala.* `varianteViva()` en el JS del storefront: si el
corazón no estaba dentro de un formulario de carrito, subía hasta la `section`
más cercana y se quedaba con el **primer** `form[action*="/cart/add"]` que
encontrara; y si no había, con el `?variant=` de la URL. En la ficha de un
producto, las dos cosas son la variante del producto **de la página**.

Así que dar corazón a un recomendado —o a cualquier tarjeta de otro producto
dentro de una ficha— guardaba un favorito con el `productId` de la tarjeta y
el `variantId` de la página.

*Por qué se veía así.* `resolverProductos()` confiaba en el `variantId`
guardado sin comprobar que fuera **de ese producto**. Entonces la entrada salía
con el título, la imagen y el enlace del producto guardado —esos vienen del
producto— pero con el **precio y la variante de carrito del ajeno**. De ahí que
el título estuviera bien y el precio mal, que es lo que hacía que el síntoma
pareciera otra cosa.

**Cómo se arregló.** Las dos mitades, porque una sola no alcanza:

1. `varianteViva()` solo usa las fuentes de página —el formulario de la sección
   y el `?variant=`— cuando el botón es el del producto de la página, y eso se
   sabe comparando su `data-lovelist-handle` con el handle de la URL. Para el
   resto vale lo que traiga el propio botón, que en una tarjeta de colección es
   nada: quien da corazón en una grilla no eligió talle ni color.
2. `resolverProductos()` ignora una variante que no pertenece al producto
   guardado. La consulta ya traía `product { id }`, así que es una condición.
   Esto **repara las filas ya guardadas**, que siguen en la base de cada tienda
   y no se van a poder migrar una por una.

**Lecciones.**

- **Los datos se pueden guardar mal, no solo mostrar mal.** Todas las
  comprobaciones apuntaban a la lectura; ninguna miraba qué se escribía. El
  banco ahora comprueba el cuerpo del `POST` al guardar desde la ficha de otro
  producto.
- **Una hipótesis del que reporta es un dato, no una conclusión.** La de quitar
  items era razonable y era falsa; seguirla costó una ronda. Lo que la cerró fue
  construir a mano la fila sospechada —producto de uno, variante de otro— y ver
  si daba los tres síntomas. Daba los tres.
- **Confiar en un dato propio tampoco es gratis.** El `variantId` venía de
  nuestra base, no de un tercero, y aun así estaba mal. Un identificador que
  apunta a otra entidad hay que validarlo contra ella cuando se resuelve.

---

### 4.13 En Vercel, lo que no se espera no pasa

**Cómo se manifestó.** El dashboard decía "todavía no detectamos actividad"
después de visitar el storefront con el embed activo. En la base, el evento de
carrito de esa misma visita estaba registrado y `Shop.embedVistoAt` seguía en
`null`.

**Causa real.** La marca se escribía sin esperarla:

```ts
void prisma.shop.update({ ... }).catch(() => {});
```

La idea era no sumarle ni un milisegundo a una respuesta del storefront. En un
entorno sin servidor eso no funciona: la función **se congela apenas responde**
y la escritura nunca sale. El evento de carrito sobrevivió porque su ruta sí lo
espera.

**Cómo se arregló.** Se espera. El costo real es una escritura por hora y por
tienda, porque el tope de una hora ya estaba: la optimización que motivó el
`void` la hacía el tope, no el no esperar.

**Lección.** Fuera de un servidor de proceso largo, el trabajo en segundo plano
después de la respuesta **no existe**. Si algo tiene que pasar, se espera; si no
vale la pena esperarlo, no vale la pena hacerlo. Y el contraste sirvió de
diagnóstico: dos escrituras en la misma petición, una esperada y otra no, y solo
llegó la esperada.

---

### 4.14 La instalación mostraba el número "200" y nada más

**Cómo se manifestó.** Instalar la app y entrar mostraba una pantalla con el
texto **"200"** en negrita, solo. Es lo primero que hace un revisor de Shopify,
así que era motivo de rechazo directo.

**Causa real.** El paywall del layout hacía `throw redirect("/app/plans")` con
el `redirect` de **react-router**. Dentro del admin embebido ese no sirve: la
librería de Shopify trae el suyo, que sale de `authenticate.admin(request)`, y
su documentación de tipos dice para qué está — *"ensuring that the appropriate
parameters are set for embedded apps"*.

Leyendo `helpers/redirect.js` de la librería, hace dos cosas que el otro no:
copia `shop`, `host` y `embedded` al destino cuando es del mismo origen, y para
peticiones embebidas o de datos redirige por App Bridge en vez de devolver un
302 que el iframe no sabe seguir.

La cadena, medida paso a paso:

1. El redirect mandaba a `/app/plans` **pelado**, sin `shop` ni `host`.
2. Comprobado con `curl`: esa URL sin parámetros devuelve **410** y el rebote
   de la librería, porque no puede autenticar.
3. Ese rebote lo produce `renderAppBridge`, que hace
   `throw new Response(html, { headers })` **sin `status`, o sea 200**.
4. `boundary.error` de la librería renderiza `error.data` como HTML. Cuando el
   cuerpo se pierde en la conversión a error, queda el status: `"200"`.

O sea que el número en pantalla era **el status de una respuesta interna de
Shopify que quedó huérfana**.

**Cómo se arregló.** `const { session, redirect } = await authenticate.admin()`.
Era el único `redirect` de react-router que quedaba en el admin.

**Lección.** En un admin embebido, redirigir no es devolver un 302. Cuando una
librería expone su propio helper para algo que el framework ya trae, casi
siempre es porque el del framework no alcanza — y conviene leer por qué antes
de usar el genérico.

**Y una segunda, sobre el síntoma:** un número suelto en pantalla no es un
error de red ni un fallo de renderizado. Es casi siempre un status que alguien
pintó como si fuera contenido. Buscar quién lanza una Response sin `status`
llevó directo a la causa.

---

### 4.9 Otros errores más chicos, con su lección

**El `@@unique` con `NULL` no impedía duplicados.** En Postgres `NULL != NULL`,
así que `(lista, producto, NULL)` entraba infinitas veces — justo el caso del
corazón en colecciones, el más frecuente. Se arregló con `NULLS NOT DISTINCT` en
el índice (PG≥15; Neon corre 17). Prisma no modela esa cláusula: vive en el SQL
de la migración, y se verificó que no reporta drift.
*Lección: un constraint declarado no es un constraint que hace lo que creés.*

**`var btn` dentro de un `while`.** En `bombearCola()`, todos los callbacks
compartían la misma variable —`var` es de función, no de bloque— y `pintarBoton`
repintaba siempre el último botón. Los atributos quedaban bien porque los ponía
otra función con su propio parámetro; solo el pintado estaba mal.
*Lección: en JS sin transpilar, `var` en un bucle con callbacks es un bug esperando.*

**`IntersectionObserver` no dispara en pestañas de fondo.** La primera versión
de la resolución de handles pedía solo las tarjetas que entraban en pantalla. En
una pestaña en segundo plano el navegador no calcula intersecciones y los
corazones no se pintaban nunca. Se cambió por resolución con concurrencia y
techo.
*Lección: un comportamiento que depende de si la pestaña está visible es además imposible de probar de forma fiable.*

**El estado optimista no era inmediato.** `alternar()` empezaba resolviendo el
producto, que en una tarjeta sin ID en el DOM es una petición de red. El
comprador veía el corazón quieto medio segundo. Ahora se pinta sincrónicamente y
se reconcilia después.
*Lección: "optimista" significa antes de la red, no antes de la respuesta.*

**El `.theme-check.yml` empeoró las cosas.** Se intentó silenciar un falso
positivo agregando configuración a la extensión. Eso hizo que theme check
cambiara al ruleset genérico de tema y empezara a rechazar `target`,
`javascript` y `stylesheet`, que en un app block son válidos. Cambió un hallazgo
falso por cuatro. Se descartó.
*Lección: antes de silenciar una advertencia, comprobar qué más apaga.*

**`new URL().pathname` con espacios en la ruta.** El repo vive en
`C:\Users\Jonas\Documents\App favoritos\`. `.pathname` devuelve `%20` y esbuild
no resuelve esa ruta. Hay que usar `fileURLToPath`.
*Lección: el espacio en el nombre de la carpeta es parte del entorno; no asumir rutas limpias.*

**Parameter properties de TypeScript.** Node no las soporta en modo strip-only,
así que `constructor(readonly status: number)` impedía ejecutar los módulos
fuera de Vite para probarlos. Se reescribieron con campos explícitos.
*Lección: si querés poder ejecutar el código con `node` directamente, evitá la sintaxis TS que emite código.*

---


### 4.15 La app entera andaba y el botón de pagar estaba apagado

**Cómo se manifestó.** Recorriendo el flujo en la tienda real después de
cambiar el modelo de cobro: la pantalla de planes se veía perfecta —los dos
planes, el actual marcado, los precios— y el botón **"Cambiar a Pro" estaba
deshabilitado**, con una nota discreta debajo. No había forma de suscribirse.

**Causa.** `urlDePlanes()` dependía sólo de `SHOPIFY_APP_HANDLE`, que no está
definida en Vercel. Sin handle no se puede armar la URL de la página de precios,
y la pantalla degradaba a botón apagado.

Lo más incómodo es que **era deliberado**: el comentario decía que no había
valor de reserva a propósito, porque uno inventado llevaría a una página que no
existe y el merchant no sabría que el problema es nuestro. El razonamiento vale
para un valor inventado. Pero el handle no lo es: está en `shopify.app.toml`,
versionado, y es exactamente el que usa Shopify. Ahora Vite lo hornea en el
build y la variable de entorno sólo lo pisa si existe.

**Lecciones.**

- *Una degradación elegante puede esconder un fallo total.* La nota discreta se
  eligió para no asustar a un revisor con un cartel rojo, y funcionó tan bien
  que el problema pasaba por decisión de diseño. Un cartel rojo se habría visto
  el primer día.
- *"Sin valor de reserva a propósito" hay que revisarlo cuando lo que se cae es
  el camino del dinero.* El costo de equivocarse no era simétrico: un enlace
  roto se reporta, un botón apagado se acepta.
- *Y hay que recorrer el flujo completo en la tienda de verdad.* Ni el
  typecheck, ni el lint, ni el banco, ni el deploy de la extensión miran esto.
  Apareció al mirar la pantalla.

### 4.16 Tres textos que sólo se ven mirando

En el mismo recorrido, y todos invisibles para las herramientas:

- El aviso del dashboard decía **"1 de tus listas alcanzaron"**. Y es el caso
  más probable de todos: el aviso aparece justo cuando la *primera* lista llega
  al tope. Ahora hay forma singular y plural.
- Ese aviso y la pantalla de confirmación prometían **"sin límite" con Pro**,
  que ya se había corregido en la pantalla de precios y se quedó en los otros
  dos lugares. *Lección: cuando se corrige una promesa, hay que buscar todas sus
  copias.*
- El texto por defecto del aviso de lista llena en el app embed estaba **sin
  tildes** —"Esta lista alcanzo su limite"—, que es lo que veía el comprador:
  el default del schema le gana al catálogo cuando el merchant no lo
  personalizó. El resto de los defaults del bloque sí tienen acentos. *La regla
  de escribir sin acentos es para los mensajes de commit, no para lo que se le
  muestra a la gente.*


## 5. Trampas del entorno

Lo que un recién llegado va a pisar.

### El error de `AssetSizeAppBlockJavaScript` es un falso positivo

`shopify app build` muestra siempre:

```
[error]: AssetSizeAppBlockJavaScript
The file size for 'lovelist.js' (20740 B) exceeds the configured threshold (10000 B)
```

**No es un problema.** El límite documentado de Shopify es de 10 kB sobre el
archivo **comprimido**, y está marcado como *suggested*. Estamos en **6,8 kB
comprimidos**. Theme check aplica la misma cifra contra el archivo **crudo**,
que es otra medida.

No se puede silenciar sin romper cosas (ver 4.9). El control real está en
`scripts/build-theme.mjs`, que falla el build si el comprimido pasa de 10 kB
(Shopify) o de 30 kB (regla del proyecto).

### Después de cada `shopify app deploy`, recarga forzada

El CDN sigue sirviendo el asset viejo un rato. **Siempre** Ctrl+F5 antes de dar
por rota una entrega. Ya nos costó una ronda completa.

### Los snippets de prueba van en el storefront, no en el admin

Cualquier prueba de la API del proxy tiene que correr desde una página de
`calendario-envios-test-final.myshopify.com`, porque es Shopify quien firma la
petición al reenviarla. Desde el admin embebido o desde `curl` no hay firma y
todo devuelve 401.

### `shopify app deploy` es obligatorio para la extensión

Los cambios en `extensions/` **no llegan a la tienda** hasta que se despliegan.
Un `git push` no alcanza. Vercel despliega la app; el CLI despliega la
extensión. Son dos cosas separadas y hay que hacer las dos.

### Los assets de la extensión son generados

`extensions/lovelist-theme/assets/lovelist.js` y `.css` se **generan** desde
`theme-src/` con esbuild. No editarlos a mano: se pisan. La fuente legible es
`theme-src/`.

Existen porque Shopify limita el tamaño del JS de un app block y escribir la
lógica entera en 10 kB sin minificar obligaría a borrar comentarios y acortar
nombres.

### Para ejecutar módulos del servidor en pruebas hace falta un hook

Los imports son relativos sin extensión (resolución de bundler). Node ESM exige
extensión explícita. Las pruebas usan un hook de resolución de ~10 líneas que
prueba `.ts` y `.tsx`. Y los archivos con JSX no se pueden cargar así: por eso
las rutas de webhook se renombraron de `.tsx` a `.ts`, que además es correcto
porque no tienen JSX.

### PowerShell y Git Bash conviven

Ambos están disponibles. Cuidado con mezclar rutas: Python en Windows no entiende
`/c/Users/...` de Git Bash. Y `Get-Content` muestra mal los acentos de archivos
UTF-8; no es corrupción del archivo, es el display de la consola.

---

## 6. Deuda técnica y atajos

### El bundle del storefront está al 68% del límite

6,8 kB comprimidos sobre 10 kB. Ya no es holgado.

La 2.5 **ya no lo empeora**: la configuración viaja por Liquid, no por JS. Pero
el margen sigue siendo el que es, así que la regla se mantiene para lo que
venga: si algo suma peso al storefront, hay que partir el bundle —por ejemplo,
dejar en el embed solo lo que hace falta en todas las páginas y cargar la lógica
de la página completa aparte.

### El selector de listas existe pero no se puede usar

La API soporta múltiples listas (`POST /proxy/lists`) y la página tiene el
selector, pero **solo aparece con más de una lista y no hay ninguna UI para
crearlas** desde el storefront. El plan no la pide en ninguna fase. Está
señalado y sin decidir.

### Los webhooks GDPR están implementados pero no probados end-to-end

Funcionan y están verificados con 25 comprobaciones ejecutando las rutas reales
con firma HMAC válida. Lo que **no** se probó es que Shopify los entregue de
verdad al endpoint desplegado. Se puede forzar con
`shopify app webhook trigger`.

Detalle de diseño a recordar: `app/uninstalled` **no borra** las wishlists, solo
las sesiones, y marca `uninstalledAt`. Si el merchant reinstala, los compradores
recuperan lo suyo. El borrado definitivo lo pide `shop/redact`, que Shopify
envía 48 horas después.

### La fusión no aplica los topes

Al fusionar invitado con cuenta no se aplican los límites de 20 listas ni 200
items. Recortar ahí sería perder favoritos justo cuando el comprador se
registra. El resultado puede quedar por encima del tope, pero está acotado
(nunca más del doble) y se corrige solo, porque los topes vuelven a aplicar en
la siguiente creación.

### Parpadeo del corazón en la primera visita

En la primera visita a una colección, los corazones se llenan unos cientos de
milisegundos después de cargar, porque hay que resolver los handles. Desde la
segunda visita es instantáneo. Se podría eliminar guardando el handle en la
base, pero eso contradice la regla de "nada de datos de producto".

### Dos catálogos de textos

`app/i18n.ts` para el servidor y el admin; `extensions/lovelist-theme/locales/`
para el storefront. **No es deuda: es la única forma posible**, porque la
extensión es un bundle que nunca toca el servidor. El plan pedía uno solo; se
corrigió el 2026-08-09 para que diga lo que de verdad se puede hacer.

### `noindex` en la vista compartida usa dos mecanismos

Cabecera `X-Robots-Tag` **y** un `<meta>` que un script mueve al `<head>`,
porque el cuerpo que devolvemos cae en medio del `<body>` del tema y ahí una
meta no cuenta. **No está confirmado que el App Proxy reenvíe cabeceras de
respuesta personalizadas.** Por eso están los dos. Vale la pena verificarlo.

### El conteo del contador puede no coincidir con lo que se ve

El contador cuenta items guardados; el drawer y la página ocultan los productos
borrados o despublicados. Si alguien tiene guardado algo que ya no existe, verá
un número mayor que la cantidad de tarjetas. Es menor y quedó sin resolver.

---

## 7. Qué falta

### Verificación pendiente de la Fase 2.4 — los siete pasos, ninguno hecho

**Nada de la 2.4 se probó en la tienda real.** La entrega y el final de la
sesión coincidieron, así que los siete pasos quedaron sin ejecutar. Lo que hay
es verificación en el banco de pruebas y contra la Admin API real, que es
exactamente el nivel de confianza que ya nos falló tres veces (ver sección 8).

Hasta que Jonas los corra, la 2.4 **no está cerrada** y no se arranca la 2.5.

El paso más importante es el séptimo, porque valida una promesa explícita del
plan y toca el terreno donde ya apareció un bug (`onlineStoreUrl`, ver 4.6):

> Despublicá un producto guardado desde el admin y recargá la página de
> favoritos: debe **desaparecer** de la lista, no romper la página.

Aprovechar la misma pasada para comprobar si el App Proxy reenvía la cabecera
`X-Robots-Tag` en `/apps/lovelist/shared/:token`. Es la duda que quedó abierta
en la sección 6 y solo se resuelve mirando la respuesta real.

### Fase 2.5 — Configuración en el tema y admin

**El alcance cambió el 2026-08-09.** La versión anterior guardaba la
configuración visual en `Shop.settings` y obligaba al storefront a leerla desde
el servidor. Jonas lo resolvió al revés, y es mejor por tres razones: sin red no
hay parpadeo del ícono, sin JS nuevo no se toca el presupuesto del bundle, y el
merchant configura donde ya está parado —el editor de temas— cuando coloca el
bloque. El detalle definitivo está en `PLAN-MVP.md`.

1. **Lo visual son settings del app embed block**, renderizados en Liquid: ícono
   corazón o estrella, estilo relleno o línea, colores activo e inactivo, texto
   del botón o solo ícono, mostrar u ocultar el contador. Hoy esos valores están
   fijos en `theme-src/`; hay que exponerlos como `settings` del bloque.
2. **`Shop.settings` no guarda configuración visual.** La columna existe y queda
   libre para lo que el storefront no necesite leer.
3. **Dashboard** en `/app`: total de listas, total de items guardados, y los 10
   productos más deseados con su conteo.
4. **`/app/settings` es de solo lectura**: refleja la configuración vigente, con
   enlace directo al editor de temas para cambiarla, más las instrucciones de
   instalación (activar el embed, colocar el bloque en la página de producto).
   Ahí es donde los merchants se pierden.
5. **Soporte** en `/app/support`: datos de contacto reales y enlace a la
   documentación.

**Cero JS nuevo en el storefront por la configuración.** Es consecuencia directa
de la decisión, y es lo que saca de encima la presión sobre el bundle.

### Fase 2.6 — Cobro  ✅ hecha

**Shopify App Pricing (antes Managed Pricing).** La app no crea suscripciones ni
toca dinero: sólo *lee* qué plan tiene cada tienda.

**El modelo es un límite, no un muro.** Gratis: 10 productos por lista. Pro
(US$ 29/mes): 200. La app funciona **entera** en los dos planes —corazones,
panel, página, compartir, métricas—; lo único que cambia es cuántos favoritos
entran en una lista.

Cómo quedó:

1. Un plan de pago: handle `pro`, $29/mes, sin trial.
2. `/app/plans` es **informativa**: muestra los dos planes, marca el actual y
   lleva a la página de precios de Shopify. Nadie llega ahí redirigido.
3. Sondeo contra `currentAppInstallation.activeSubscriptions` (**plural**),
   leyendo **`planHandle`, no `name`** (el nombre viene traducido y el mapeo
   falla en tiendas no inglesas).
4. Ruta de retorno `/app/plans/confirm`, que verifica contra Shopify.
5. El límite vive en `limiteItemsPorLista()` y lo aplica `agregarItem()`.

Dos cosas que en la otra app de Jonas salieron mal y acá van bien desde el
principio:

- **`/confirm` debe verificar contra Shopify.** El `plan_handle` de la URL se usa
  como pista; el plan sólo se escribe si `activeSubscriptions` lo confirma. En la
  otra app se escribe directo desde `?plan_handle=`, así que cualquier merchant
  autenticado se sube de plan visitando una URL.
- **La salvaguarda anti-degradación debe distinguir "no sé" de "no tiene".** Ante
  error de API o handle desconocido, **conservar** el plan. Pero si la respuesta
  viene **sin errores** y con `activeSubscriptions: []`, eso es una confirmación
  de que no hay suscripción — ahí sí se baja. Sin esto, una cancelación no se
  refleja nunca.
- **Nada de `catch` que sólo hace `console.error`.**

### Por qué el paywall se sacó entero

Hubo un paywall duro: sin suscripción, el storefront devolvía 402 y el admin
entero redirigía a la pantalla de planes. **Se eliminó.** Dos razones, las dos
de peso:

- Una app pública no puede secuestrarse a sí misma detrás de un muro. El
  revisor de Shopify instala y prueba sin suscribirse: aterrizar en un cartel
  de "pagá para usar" era la vía más corta al rechazo.
- El merchant prueba antes de pagar. Con el muro no podía ni ver qué compraba.

Lo que reemplaza al muro es el límite de productos por lista. Con eso el
merchant conoce la app entera, y paga cuando sus compradores se topan con el
tope — que es justo cuando la app le está sirviendo.

Consecuencias que hay que sostener:

- **Nada se borra ni se esconde nunca.** Una lista que quedó con 40 favoritos
  porque la tienda bajó de Pro a Gratis los sigue mostrando, y se pueden
  quitar. Lo único que no se puede es agregar más.
- **El límite no aplica a lo ya guardado.** Re-mandar un favorito que ya está
  en la lista devuelve OK aunque esté llena: el comprador no está agregando
  nada. Esto **falló** al escribirlo —el conteo se miraba antes de descartar el
  duplicado— y lo agarró `npm run test:limite`.
- **El aviso lo escribe el merchant.** El texto del tope es un editable del app
  embed (`texto_lista_llena`), no una cadena nuestra.
- **El dashboard avisa solo.** Cuando hay listas en el tope, y sólo entonces,
  aparece la sección que lo dice. Si nadie lo toca, no hay ruido.

### El tope de Pro son 200, y la pantalla de precios lo dice

Pro se pensó como "sin límite", pero `LIMITE_ITEMS_PRO = 200`: es la guarda
contra abuso que existe desde la Fase 2.1, y tiene que existir porque el
`anonymousId` lo genera el cliente y puede rotarlo.

La pantalla de precios dice **"Hasta 200 productos por lista"** y no "sin
límite". Prometer ilimitado en una página de precios y cortar en 200 es texto
que no se cumple. Doscientos favoritos en una lista está muy por encima de
cualquier uso real, así que el número no molesta a nadie; la promesa falsa sí.

### Por qué la Admin API y no la Partner API para leer el plan

La documentación de Shopify App Pricing empuja hacia
`activeSubscription(appId:, shopId:)` de la **Partner API**. No se usa.

Esa API pide una credencial de organización: un secreto más que guardar, rotar
y proteger, que además no es por tienda. Para responder "¿esta tienda paga?"
alcanza con `currentAppInstallation.activeSubscriptions` de la Admin API, con
el token offline que ya tenemos.

**Dos detalles que cuestan encontrar:**

- El handle no está donde uno lo busca. Vive en
  `activeSubscriptions → lineItems → plan → pricingDetails → ... on
  AppRecurringPricing → planHandle`.
- **Requiere la versión 2025-07 de la API o posterior.** En versiones
  anteriores el campo no existe y la respuesta vuelve sin él, sin decir por
  qué. Estamos en `July26`.

Y lo de siempre: se lee `planHandle`, **nunca `name`**. El nombre viene
traducido al idioma de la tienda y cualquier comparación contra él falla en
tiendas que no estén en inglés.

**No hay webhooks de suscripción.** Shopify lo dice explícitamente, así que el
sondeo no es una elección de diseño: es el único mecanismo que existe.

---

### Limitación conocida: no todos los textos son editables

**Doce de los treinta y un textos del storefront no se pueden cambiar desde el
app embed.** No es un olvido: es un techo de Shopify.

Cada bloque de una theme app extension admite como máximo **25 settings
interactivos** (`text`, `select`, `checkbox`, `color`…) y **6 no interactivos**
(`header`, `paragraph`). Los treinta y un textos más los cinco de configuración
visual daban 36, muy por encima.

Los que quedaron fijos son los que el comprador ve rara vez: cerrar, cargando,
lista llena, demasiado rápido, link copiado, WhatsApp, Email, y los cinco
mensajes de error. Los diecinueve editables son los que se leen siempre.

**Consecuencia asumida:** un merchant que no hable español va a ver **los
mensajes de error en español**. Se eligió así porque los errores aparecen rara
vez y el resto de la interfaz aparece siempre. Cuando el multiidioma entre en
alcance —hoy está fuera del MVP— esto se resuelve de raíz.

**Dos trampas de este límite, para el que venga después:**

1. **La documentación de Shopify no publica ninguno de los dos números.** La
   página de configuración lista otros límites —30 bloques, 100 KB de Liquid,
   10 MB de archivos— y de settings no dice nada. Los números salieron del
   mensaje de error y del foro de desarrolladores.
2. **`shopify app build` no los comprueba: pasa sin chistar.** El único lugar
   donde se validan es `shopify app deploy`, del lado del servidor. Por eso,
   desde el 2026-08-09, toda entrega que toque el storefront se despliega antes
   de darse por terminada. `shopify app deploy --no-release` crea la versión y
   la valida sin publicarla, que es la forma barata de comprobarlo.

Hoy el bloque está en 24 interactivos y 5 no interactivos: **queda un lugar de
cada uno**. Agregar dos settings de un tipo rompe el deploy.

---

### Pendientes de lanzamiento (requisitos de la App Store)

Salieron de leer la documentación vigente el 2026-08-09. **Ninguno es de la
Fase 2.5**: son condiciones para publicar, y hay que resolverlas antes de
mandar la app a revisión.

**El plan Pro todavía no existe en Shopify.** Es el pendiente que bloquea el
cobro, y se ve al recorrer el flujo: el botón "Cambiar a Pro" lleva a
`admin.shopify.com/store/{tienda}/charges/lovelist/pricing_plans`, la página es
de Lovelist —el handle es correcto— pero devuelve **404**, porque los planes se
crean en la ficha de la App Store y esa ficha no está armada. Del lado del
código está todo: el handle se hornea en el build, la URL se arma bien, el
sondeo lee `activeSubscriptions` y `/confirm` verifica contra Shopify. Falta
crear el plan con handle **`pro`**, US$ 29/mes, sin trial. Hasta entonces el
botón lleva a un 404.

**Política de privacidad publicada.** El listado la exige y hoy no existe. Hace
falta una URL pública. Es fácil de escribir —no guardamos datos personales, ni
nombre ni email de nadie, solo IDs— pero tiene que estar publicada y dicha en
los términos que pide Shopify.

**Assets del listado.** Ícono de 1200×1200, capturas, medios de la funcionalidad,
introducción de 100 caracteres, detalle de 500, y un **screencast completo del
proceso de instalación y uso, en inglés o subtitulado en inglés**. Ese último es
el que más trabajo lleva y el que más se subestima.

**Medición de Lighthouse del storefront.** Shopify exige que la app **no baje
más de 10 puntos** el score de Lighthouse de la tienda. Nunca lo medimos. Hay
que hacerlo con la app activa y sin ella, sobre la misma página, y comparar.

**Métricas del admin.** LCP ≤ 2,5 s, CLS ≤ 0,1 e INP ≤ 200 ms, a percentil 75
sobre 28 días y con mínimo 100 mediciones. Se miden solas con App Bridge; hay
que mirarlas en el Partner Dashboard una vez que haya tráfico.

**Puertas que no dependen del código:** 50 instalaciones netas en tiendas de
pago, 5 reseñas y un mínimo de calificación. Son de Built for Shopify y llegan
después de publicar.

**Lo que sí cumplimos ya:** theme app extensions en vez de scripts, sin tocar la
Asset API, webhooks GDPR reales, `app/uninstalled`, cero datos personales, OAuth
inmediato, y el cobro implementado del lado del código (Fase 2.6). Y algo que
pesa más de lo que parece: **la app no se esconde detrás de un muro**. El
revisor instala y prueba todo sin suscribirse.

---

### Fuera del alcance del MVP

Alertas de vuelta a stock, avisos de bajada de precio, emails de recordatorio,
listas de regalo, analítica avanzada, multiidioma, integraciones con Klaviyo o
Mailchimp, POS.

---

## 8. Cómo trabajamos

### El protocolo

**Una fase a la vez, y se para al terminarla.** Al final de cada fase:

1. `npm run typecheck` y `npm run build`, los dos limpios
2. Commit y push a `main`
3. **Si la entrega toca el storefront, `shopify app deploy` antes de darla por
   terminada.** Hay validaciones que solo corren del lado del servidor —los
   límites de settings del app embed, por ejemplo— y `shopify app build` no las
   ve. Entregar sin desplegar es entregar sin saber si compila de verdad.
   `--no-release` valida sin publicar
4. **Parar.** Reportar qué quedó hecho y **cómo lo prueba Jonas**, con pasos
   concretos y qué debería ver en pantalla
5. Esperar su visto bueno antes de la fase siguiente

No adelantar fases. No dejar código de una fase futura "ya que estamos". Si algo
de una fase revela que una decisión del plan está mal, **decirlo y parar**, no
improvisar en silencio.

Si una fase resulta más grande de lo que parece, partirla y avisar. Jonas
prefiere cuatro entregas chicas y verificables que una grande sin saber por
dónde probar.

### El reparto de trabajo

- **Jonas prueba en la tienda real y trae los resultados.** Es el único que
  puede: hace falta un navegador con sesión, una tienda con tema y datos.
- Lo que se puede verificar sin él —la base, la Admin API, la lógica del
  storefront en el banco— se verifica antes de entregar. No se entrega nada sin
  probar lo que sí se puede probar.
- **Los tres bugs que se escaparon a producción tenían algo en común:** el banco
  de pruebas los daba en verde. Cuando algo falla en la tienda y las pruebas
  pasaban, **la primera pregunta es por qué las pruebas estaban ciegas**, y hay
  que agregar el caso antes de arreglar. Jonas lo pidió explícitamente y tenía
  razón.
- **Verificar desde el estado inicial limpio, no desde el que dejó la prueba
  anterior.** Es la regla que más cara salió (ver 4.11): el panel del carrito se
  dio por bueno porque la verificación corrió con productos que las pruebas
  previas habían dejado en el carrito, y eso ocultaba el caso más común de
  todos, el comprador que agrega su primero. Antes de dar algo por bueno, dejar
  el estado como lo encuentra un visitante que llega por primera vez.
- **Cuando se integra con algo ajeno, probar el camino exacto que usa el
  código**, no uno equivalente. En 4.10 tres pruebas del mecanismo daban verde
  mientras la única llamada que importaba fallaba.
- **Un `catch` que registra y sigue convierte un fallo ruidoso en uno
  invisible.** Si no se puede seguir de verdad, hay que caer al camino que
  funciona siempre, no a uno peor.

### Qué quiere que le digan y no que se resuelva solo

- Si una decisión del plan parece equivocada al implementarla
- Si una fase necesita un scope que no está en `read_products`
- Si algo requiere aprobación de Protected Customer Data
- Si el bundle del storefront se pasa de tamaño
- Si hay que instalar una dependencia nueva que no sea trivial
- Si aparece un problema de una fase anterior que hay que arreglar antes de
  seguir

### Comandos útiles

```bash
npm run typecheck        # react-router typegen && tsc --noEmit
npm run build            # construye assets del tema y la app
npm run build:theme      # solo los assets del tema, con control de tamaño
npm run test:theme       # banco de pruebas del storefront en :8787
npm run test:limite      # limite por plan, contra la base de datos real
npm run migrate:deploy   # aplica migraciones a Neon
shopify app deploy       # publica la extensión y la config
shopify app config validate
```

### El banco de pruebas del storefront

`npm run test:theme` y abrir `http://localhost:8787`. Hay que pasar por **todos**
los modos de la tabla, no por algunos:

| URL | Qué comprueba |
|---|---|
| `/` | invitado, primera visita, caché frío |
| `/` recargando | caché tibio: debe pintar sin pedir red |
| `/?sin-estado` | sin nada guardado: no debe gastar ni una petición |
| `/?logueado` | fusión al iniciar sesión |
| `/?merge-falla` | la fusión falla: conserva el `anonymousId` y reintenta |
| `/?pagina` | página completa: grilla, carrito, compartir, quitar |
| `/?pagina&sin-drawer` | tema sin panel de carrito: tiene que terminar en `/cart` |
| `/?pagina&secciones-nulas` | hay panel pero Shopify devuelve `sections: null`: también va a `/cart` |
| `/?config-alt` | el merchant cambió la config del embed: estrella, en línea, sin contador |
| `/?pagina&config-alt` | lo mismo, para la clase de botón del tema |
| `/?lista-llena` | la lista llegó al tope del plan: la app sigue entera, sólo falla agregar |

`sin-drawer` y `secciones-nulas` **hay que correrlos con `&pagina`**. Sueltos dan
verde sin probar nada: el clic al carrito vive dentro del bloque de la página.
Los dos **terminan navegando a propósito** — aterrizar en `/cart` es el resultado
que se comprueba, y la página de destino la sirve el propio banco.

Lo que el banco **no** puede probar es el servidor: simula al navegador, y el
navegador nunca manda un alta de algo que ya tiene guardado. Ese caso vive en
`npm run test:limite`, que corre contra la base de verdad.

Simula un header estilo Dawn con cinco enlaces al carrito, cinco formas de
tarjeta de producto y un banner promocional. Esos casos están porque **cada uno
corresponde a un bug que se escapó**.

### Idioma

Todo en español de LATAM: la interfaz, los comentarios del código y los mensajes
de commit. Los mensajes de commit son largos y explican **por qué**, no solo
qué. Sin acentos en los mensajes de commit por compatibilidad con la consola.

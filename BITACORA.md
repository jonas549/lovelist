# Bitácora de Lovelist

> Escrita el 2026-08-08 al cerrar la primera sesión de trabajo.
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

| Fase | Qué entregó | Commit de cierre |
|---|---|---|
| 1 | Cascarón desplegado: app creada, Neon, App Proxy, HMAC verificado | `3bac714`, más `32e0ee7` y `d57a664` |
| 2.1 | Modelo de datos y los 7 endpoints del proxy | `b58c5be`, más `801b909` |
| 2.2 | Theme app extension: embed, botón, inyección en colecciones | `6d64965`, más `25dfe61` |
| 2.3 | Invitados y fusión con la cuenta al iniciar sesión | `374b7a0` |
| 2.4 | Página completa, compartir, y resolución de productos en el servidor | `b057fc7` |

Las fases 1, 2.2 y 2.4 necesitaron un commit extra de corrección **después** de
que Jonas probara en la tienda real. Eso no es excepción: es el patrón. Ver la
sección 4.

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

- Los 7 endpoints del proxy, con firma HMAC generada por la implementación
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

**Sin probar todavía:** la página `/apps/lovelist` y la vista compartida en la
tienda real. Jonas tenía siete pasos de verificación de la Fase 2.4 y no llegó
al último. Ver sección 7.

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

6,8 kB comprimidos sobre 10 kB. Ya no es holgado. **Si la Fase 2.5 suma mucho JS
al storefront, va a haber que partir el bundle**: por ejemplo, dejar en el embed
solo lo que hace falta en todas las páginas y cargar la lógica de la página
completa aparte.

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
para el storefront. El plan pide uno solo y no se puede: la extensión es un
bundle que nunca toca el servidor.

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

### Verificación pendiente de la Fase 2.4

Jonas probó hasta el paso 6 de 7. **Falta el paso 7**, y es el que valida una
promesa explícita del plan:

> Despublicá un producto guardado desde el admin y recargá la página de
> favoritos: debe **desaparecer** de la lista, no romper la página.

También quedan sin probar en la tienda real la página `/apps/lovelist` completa
y la vista compartida (pasos 2 a 6). Están verificados en el banco y contra la
Admin API, pero no en el navegador de una tienda.

### Fase 2.5 — Admin

1. **Dashboard** en `/app`: total de listas, total de items guardados, y los 10
   productos más deseados con su conteo.
2. **Configuración** en `/app/settings`, guardada en `Shop.settings` (la columna
   ya existe): ícono corazón o estrella, estilo relleno o línea, color activo e
   inactivo, texto del botón o solo ícono, mostrar u ocultar el contador.
3. **Soporte** en `/app/support`: datos de contacto reales y enlace a la
   documentación.
4. Los cambios deben verse en el storefront **sin tocar el tema**. O sea que el
   JS del storefront tiene que leer esa configuración desde el servidor. Hoy los
   valores están fijos en el código; hay que dejar la costura.

Ojo con el bundle: esto suma JS al storefront.

### Fase 2.6 — Cobro

**Shopify Managed Pricing.** La app no crea suscripciones ni toca dinero: solo
*lee* qué plan tiene cada tienda.

1. Un plan: handle `pro`, $29/mes, sin trial.
2. `/app/plans` con botón a
   `https://admin.shopify.com/store/{shop}/charges/{appHandle}/pricing_plans`.
   El `appHandle` debe venir de variable de entorno **y estar definida**.
3. Sondeo contra `currentAppInstallation.activeSubscriptions` (**plural**),
   leyendo **`planHandle`, no `name`** (el nombre viene traducido y el mapeo
   falla en tiendas no inglesas).
4. Ruta de retorno `/app/plans/confirm`.
5. **Paywall duro:** sin suscripción activa el storefront no guarda favoritos y
   el admin muestra la pantalla de planes.

Dos cosas que en la otra app de Jonas salieron mal y acá van bien desde el
principio:

- **`/confirm` debe verificar contra Shopify.** El `plan_handle` de la URL se usa
  como pista; el plan solo se escribe si `activeSubscriptions` lo confirma. En la
  otra app se escribe directo desde `?plan_handle=`, así que cualquier merchant
  autenticado se sube de plan visitando una URL.
- **La salvaguarda anti-degradación debe distinguir "no sé" de "no tiene".** Ante
  error de API o handle desconocido, **conservar** el plan. Pero si la respuesta
  viene **sin errores** y con `activeSubscriptions: []`, eso es una confirmación
  de que no hay suscripción — ahí sí se baja. Sin esto, una cancelación no se
  refleja nunca.
- **Nada de `catch` que solo hace `console.error`.**

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
3. **Parar.** Reportar qué quedó hecho y **cómo lo prueba Jonas**, con pasos
   concretos y qué debería ver en pantalla
4. Esperar su visto bueno antes de la fase siguiente

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
npm run migrate:deploy   # aplica migraciones a Neon
shopify app deploy       # publica la extensión y la config
shopify app config validate
```

### El banco de pruebas del storefront

`npm run test:theme` y abrir `http://localhost:8787`. Cinco modos, hay que pasar
por todos:

| URL | Qué comprueba |
|---|---|
| `/` | invitado, primera visita, caché frío |
| `/` recargando | caché tibio: debe pintar sin pedir red |
| `/?sin-estado` | sin nada guardado: no debe gastar ni una petición |
| `/?logueado` | fusión al iniciar sesión |
| `/?merge-falla` | la fusión falla: conserva el `anonymousId` y reintenta |
| `/?pagina` | página completa: grilla, carrito, compartir, quitar |

Simula un header estilo Dawn con cinco enlaces al carrito, cinco formas de
tarjeta de producto y un banner promocional. Esos casos están porque **cada uno
corresponde a un bug que se escapó**.

### Idioma

Todo en español de LATAM: la interfaz, los comentarios del código y los mensajes
de commit. Los mensajes de commit son largos y explican **por qué**, no solo
qué. Sin acentos en los mensajes de commit por compatibilidad con la consola.

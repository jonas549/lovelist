declare module "*.css";

/**
 * El handle de la app, leído de `shopify.app.toml` y reemplazado por Vite en el
 * build (ver `define` en vite.config.ts).
 *
 * Se declara opcional a propósito: en un proceso que no pasó por Vite —un
 * script suelto de `scripts/`— la constante no existe, y el código tiene que
 * comprobarlo antes de usarla.
 */
declare const __APP_HANDLE__: string | undefined;

import { readFileSync } from "node:fs";

import { reactRouter } from "@react-router/dev/vite";
import { defineConfig, type UserConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

/**
 * El handle de la app, leido de shopify.app.toml.
 *
 * Es la fuente de verdad: el mismo valor que Shopify usa para armar la URL de
 * la pagina de precios, versionado en el repo y desplegado con el codigo. Se
 * hornea en el build para que la pantalla de planes no dependa de que alguien
 * se acuerde de definir SHOPIFY_APP_HANDLE en el hosting. Cuando falto, el
 * boton de "Cambiar a Pro" quedaba deshabilitado en produccion: la app entera
 * andaba y nadie podia pagar.
 *
 * La variable de entorno sigue mandando si existe, para poder apuntar a otra
 * app sin tocar el archivo.
 */
function handleDelToml(): string {
  try {
    const toml = readFileSync("shopify.app.toml", "utf8");
    // El handle de la app es la primera clave `handle` del archivo, la de
    // nivel superior. Las extensiones tienen la suya, mas abajo y anidada.
    const m = /^\s*handle\s*=\s*"([^"]+)"/m.exec(toml);
    return m ? m[1] : "";
  } catch {
    return "";
  }
}

// Related: https://github.com/remix-run/remix/issues/2835#issuecomment-1144102176
// Replace the HOST env var with SHOPIFY_APP_URL so that it doesn't break the Vite server.
// The CLI will eventually stop passing in HOST,
// so we can remove this workaround after the next major release.
if (
  process.env.HOST &&
  (!process.env.SHOPIFY_APP_URL ||
    process.env.SHOPIFY_APP_URL === process.env.HOST)
) {
  process.env.SHOPIFY_APP_URL = process.env.HOST;
  delete process.env.HOST;
}

// SHOPIFY_APP_URL solo se usa para el server de desarrollo (allowedHosts y HMR),
// pero un valor sin protocolo hacia reventar el build entero con un
// "TypeError: Invalid URL" bastante opaco. Preferimos degradar a localhost.
function hostnameDeAppUrl(): string {
  const crudo = process.env.SHOPIFY_APP_URL;
  if (!crudo) return "localhost";
  try {
    return new URL(crudo).hostname;
  } catch {
    console.warn(
      `[vite.config] SHOPIFY_APP_URL no es una URL valida (${crudo}). ` +
        `Deberia incluir el protocolo, por ejemplo https://tu-app.vercel.app. ` +
        `Uso "localhost" para esta build.`,
    );
    return "localhost";
  }
}

const host = hostnameDeAppUrl();

let hmrConfig;
if (host === "localhost") {
  hmrConfig = {
    protocol: "ws",
    host: "localhost",
    port: 64999,
    clientPort: 64999,
  };
} else {
  hmrConfig = {
    protocol: "wss",
    host: host,
    port: parseInt(process.env.FRONTEND_PORT!) || 8002,
    clientPort: 443,
  };
}

export default defineConfig({
  define: {
    __APP_HANDLE__: JSON.stringify(handleDelToml()),
  },
  server: {
    allowedHosts: [host],
    cors: {
      preflightContinue: true,
    },
    port: Number(process.env.PORT || 3000),
    hmr: hmrConfig,
    fs: {
      // See https://vitejs.dev/config/server-options.html#server-fs-allow for more information
      allow: ["app", "node_modules"],
    },
  },
  plugins: [
    reactRouter(),
    tsconfigPaths(),
  ],
  build: {
    assetsInlineLimit: 0,
  },
  optimizeDeps: {
    include: ["@shopify/app-bridge-react"],
  },
}) satisfies UserConfig;

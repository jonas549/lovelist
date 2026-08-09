import type { LoaderFunctionArgs } from "react-router";

import { escaparLiquid, respuestaLiquid } from "../liquid.server";
import { manejar, verificarFirmaProxy } from "../proxy.server";
import { t } from "../i18n";

/**
 * GET /apps/lovelist — la página de favoritos del visitante.
 *
 * Devolvemos solo el armazón, en Liquid, para que herede el layout del tema.
 * La grilla la completa el JS del app embed, que ya está cargado en todas las
 * páginas.
 *
 * Por qué no la rendereamos entera acá: un invitado se identifica con el
 * anonymousId que vive en su localStorage, y eso el servidor no lo tiene en una
 * navegación normal. Server-renderizar solo para clientes registrados y no para
 * invitados serían dos caminos distintos para la misma pantalla. La vista
 * compartida sí va entera del servidor, porque ahí el token identifica la lista
 * y no hace falta saber quién mira.
 */
export const loader = ({ request }: LoaderFunctionArgs) =>
  manejar(async () => {
    const firma = verificarFirmaProxy(new URL(request.url));
    if (!firma.valido) {
      return respuestaLiquid(
        `<div class="lovelist-pagina"><p>${escaparLiquid(t("api.firmaInvalida"))}</p></div>`,
        { status: 401 },
      );
    }

    const cuerpo = `
<div class="lovelist-pagina" data-lovelist-pagina>
  <header class="lovelist-pagina-cabecera">
    <h1 class="lovelist-pagina-titulo" data-lovelist-titulo>${escaparLiquid(t("pagina.titulo"))}</h1>
    <div class="lovelist-pagina-selector" data-lovelist-selector hidden></div>
  </header>

  <div class="lovelist-pagina-acciones" data-lovelist-acciones hidden></div>

  <div class="lovelist-pagina-cuerpo" data-lovelist-pagina-cuerpo>
    <p class="lovelist-pagina-cargando">${escaparLiquid(t("comun.cargando"))}</p>
  </div>

  <div class="lovelist-compartir" data-lovelist-compartir hidden></div>
</div>`;

    return respuestaLiquid(cuerpo);
  });

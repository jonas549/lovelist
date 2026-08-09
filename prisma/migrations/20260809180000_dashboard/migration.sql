-- Fase 2.5.b — lo que necesita el dashboard.

-- Cuándo fue la última vez que el storefront de esta tienda nos habló.
-- Es la señal de que el app embed está activo, sin pedir el scope read_themes.
ALTER TABLE "Shop" ADD COLUMN "embedVistoAt" TIMESTAMP(3);

-- Un clic en "agregar al carrito" desde Lovelist. Sin datos de quién lo hizo.
CREATE TABLE "EventoCarrito" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT,
    "creadoAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventoCarrito_pkey" PRIMARY KEY ("id")
);

-- El dashboard siempre pregunta por tienda y por ventana de tiempo.
CREATE INDEX "EventoCarrito_shopId_creadoAt_idx" ON "EventoCarrito"("shopId", "creadoAt");

-- Que se borre con la tienda: lo exige shop/redact y evita huérfanos.
ALTER TABLE "EventoCarrito" ADD CONSTRAINT "EventoCarrito_shopId_fkey"
    FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

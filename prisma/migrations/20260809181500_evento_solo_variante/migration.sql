-- El evento de carrito guarda la variante y nada más.
--
-- La migración anterior le puso `productId`, pero el storefront no lo conoce
-- en el momento de agregar: el botón lleva la variante. Y la métrica solo
-- cuenta, así que el producto no aporta nada. Se saca en vez de dejarlo
-- siempre en null, que sería una columna que miente.
ALTER TABLE "EventoCarrito" DROP COLUMN "productId";
ALTER TABLE "EventoCarrito" ALTER COLUMN "variantId" SET NOT NULL;

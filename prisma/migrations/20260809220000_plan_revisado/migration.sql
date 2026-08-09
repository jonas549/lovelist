-- Fase 2.6 — cuándo fue la última vez que le preguntamos a Shopify por la
-- suscripción de esta tienda.
--
-- Shopify App Pricing no manda webhooks de suscripción: lo dice su propia
-- documentación. Preguntar es el único mecanismo, y esta marca es lo que evita
-- preguntar en cada carga del admin.
ALTER TABLE "Shop" ADD COLUMN "planRevisadoAt" TIMESTAMP(3);

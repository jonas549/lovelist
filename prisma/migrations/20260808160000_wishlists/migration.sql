-- AlterTable
ALTER TABLE "Shop" ADD COLUMN     "settings" JSONB;

-- CreateTable
CREATE TABLE "Wishlist" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "customerId" TEXT,
    "anonymousId" TEXT,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "shareToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Wishlist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WishlistItem" (
    "id" TEXT NOT NULL,
    "wishlistId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WishlistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimit" (
    "key" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "Wishlist_shareToken_key" ON "Wishlist"("shareToken");

-- CreateIndex
CREATE INDEX "Wishlist_shopId_customerId_idx" ON "Wishlist"("shopId", "customerId");

-- CreateIndex
CREATE INDEX "Wishlist_shopId_anonymousId_idx" ON "Wishlist"("shopId", "anonymousId");

-- CreateIndex
CREATE INDEX "WishlistItem_wishlistId_idx" ON "WishlistItem"("wishlistId");

-- CreateIndex
-- NULLS NOT DISTINCT es la diferencia con lo que genera Prisma por defecto.
-- Sin esto, en Postgres NULL != NULL y (lista, producto, NULL) se puede insertar
-- infinitas veces: exactamente el caso del corazon en paginas de coleccion,
-- donde todavia no hay variante elegida. Requiere PG >= 15; Neon corre 17.
CREATE UNIQUE INDEX "WishlistItem_wishlistId_productId_variantId_key"
    ON "WishlistItem"("wishlistId", "productId", "variantId") NULLS NOT DISTINCT;

-- AddForeignKey
ALTER TABLE "Wishlist" ADD CONSTRAINT "Wishlist_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WishlistItem" ADD CONSTRAINT "WishlistItem_wishlistId_fkey" FOREIGN KEY ("wishlistId") REFERENCES "Wishlist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Identidad exclusiva: cliente registrado XOR invitado. Prisma no modela CHECK,
-- asi que lo agregamos a mano. Una wishlist sin dueño, o con dos, es un bug.
ALTER TABLE "Wishlist" ADD CONSTRAINT "Wishlist_identidad_xor"
    CHECK (("customerId" IS NOT NULL) <> ("anonymousId" IS NOT NULL));

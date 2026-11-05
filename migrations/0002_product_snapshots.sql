-- Preserve the product identity associated with orders created before catalogs.
-- Defaults also let an older deployed Worker finish in-flight writes during rollout.
ALTER TABLE orders ADD COLUMN product_id TEXT NOT NULL DEFAULT 'eitaware-dark-blue-12';
ALTER TABLE orders ADD COLUMN product_title TEXT NOT NULL DEFAULT 'Dark Blue Dinnerware Set';
ALTER TABLE orders ADD COLUMN product_subtitle TEXT NOT NULL DEFAULT '12-piece stoneware dinnerware set';
ALTER TABLE orders ADD COLUMN product_image TEXT NOT NULL DEFAULT '/images/product-set.webp';
ALTER TABLE orders ADD COLUMN product_asin TEXT DEFAULT 'B0H8X1MSP5';

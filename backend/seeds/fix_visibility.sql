-- Fix product visibility in mobile app
-- Run on VPS: docker exec -i <postgres_container> psql -U <user> -d <db> < fix_visibility.sql

BEGIN;

-- 1. Make all real products (not internal markers) available to customers
UPDATE products
SET available_for_customers = true
WHERE available_for_customers = false
  AND name NOT LIKE '\\_\\_%';

-- 2. Set company mode to 'public' for companies that have no mode or invalid mode
--    (skips companies intentionally set to 'private')
UPDATE companies
SET mode = 'public'
WHERE mode IS NULL
   OR mode NOT IN ('public', 'private');

-- Show result summary
SELECT
  (SELECT COUNT(*) FROM products WHERE available_for_customers = true AND name NOT LIKE '\\_\\_%') AS visible_products,
  (SELECT COUNT(*) FROM products WHERE available_for_customers = false AND name NOT LIKE '\\_\\_%') AS still_hidden_products,
  (SELECT COUNT(*) FROM companies WHERE mode = 'public') AS public_companies,
  (SELECT COUNT(*) FROM companies WHERE mode = 'private') AS private_companies;

COMMIT;

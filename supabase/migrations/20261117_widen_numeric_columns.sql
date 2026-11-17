-- Widen all numeric price, rate, and percentage columns to NUMERIC(18, 2)
-- to prevent PostgreSQL "numeric field overflow" on high SDG values or large jumps.

ALTER TABLE public.exchange_rates
  ALTER COLUMN parallel_usd_sdg TYPE NUMERIC(18, 2),
  ALTER COLUMN official_usd_sdg TYPE NUMERIC(18, 2),
  ALTER COLUMN craftsmanship_sdg TYPE NUMERIC(18, 2);

ALTER TABLE public.gold_prices
  ALTER COLUMN ounce_usd TYPE NUMERIC(18, 2),
  ALTER COLUMN parallel_usd_sdg TYPE NUMERIC(18, 2),
  ALTER COLUMN official_usd_sdg TYPE NUMERIC(18, 2),
  ALTER COLUMN karat_24_sdg TYPE NUMERIC(18, 2),
  ALTER COLUMN karat_22_sdg TYPE NUMERIC(18, 2),
  ALTER COLUMN karat_21_sdg TYPE NUMERIC(18, 2),
  ALTER COLUMN karat_18_sdg TYPE NUMERIC(18, 2),
  ALTER COLUMN gold_pound_sdg TYPE NUMERIC(18, 2),
  ALTER COLUMN craftsmanship_sdg TYPE NUMERIC(18, 2),
  ALTER COLUMN change_pct TYPE NUMERIC(18, 2);

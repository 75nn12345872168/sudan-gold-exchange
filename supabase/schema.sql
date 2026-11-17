-- ============================================================================
-- Sudan Gold Exchange (منصة أسعار الذهب في السودان لحظة بلحظة)
-- Supabase / PostgreSQL Schema
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Exchange Rates Table (أسعار صرف الدولار ومصنعية الصاغة)
CREATE TABLE IF NOT EXISTS public.exchange_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  parallel_usd_sdg NUMERIC(18, 2) NOT NULL,
  official_usd_sdg NUMERIC(18, 2) NOT NULL,
  craftsmanship_sdg NUMERIC(18, 2) NOT NULL DEFAULT 15000,
  source TEXT NOT NULL DEFAULT 'field_admin',
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_exchange_rates_recorded_at
  ON public.exchange_rates (recorded_at DESC);

-- 2. Gold Prices Table (أسعار الذهب بجميع العيارات)
CREATE TABLE IF NOT EXISTS public.gold_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ounce_usd NUMERIC(18, 2) NOT NULL,
  parallel_usd_sdg NUMERIC(18, 2) NOT NULL,
  official_usd_sdg NUMERIC(18, 2) NOT NULL,
  karat_24_sdg NUMERIC(18, 2) NOT NULL,
  karat_22_sdg NUMERIC(18, 2) NOT NULL,
  karat_21_sdg NUMERIC(18, 2) NOT NULL,
  karat_18_sdg NUMERIC(18, 2) NOT NULL,
  gold_pound_sdg NUMERIC(18, 2) NOT NULL,
  craftsmanship_sdg NUMERIC(18, 2) NOT NULL DEFAULT 15000,
  change_pct NUMERIC(18, 2) NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'auto_sync',
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_gold_prices_recorded_at
  ON public.gold_prices (recorded_at DESC);

-- ============================================================================
-- Row Level Security (RLS)
-- ============================================================================
ALTER TABLE public.exchange_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gold_prices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access on exchange_rates" ON public.exchange_rates;
CREATE POLICY "Allow public read access on exchange_rates"
  ON public.exchange_rates
  FOR SELECT
  TO public
  USING (true);

DROP POLICY IF EXISTS "Allow service_role full access on exchange_rates" ON public.exchange_rates;
CREATE POLICY "Allow service_role full access on exchange_rates"
  ON public.exchange_rates
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public read access on gold_prices" ON public.gold_prices;
CREATE POLICY "Allow public read access on gold_prices"
  ON public.gold_prices
  FOR SELECT
  TO public
  USING (true);

DROP POLICY IF EXISTS "Allow service_role full access on gold_prices" ON public.gold_prices;
CREATE POLICY "Allow service_role full access on gold_prices"
  ON public.gold_prices
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- Optional Idempotent Initial Seed (14 Days Baseline)
-- ============================================================================
INSERT INTO public.exchange_rates (
  recorded_at,
  parallel_usd_sdg,
  official_usd_sdg,
  craftsmanship_sdg,
  source,
  notes
)
SELECT
  NOW(),
  12000.00,
  9000.00,
  15000.00,
  'initial_seed',
  'سعر الصرف والمصنعية الافتتاحي عند تأسيس المنصة'
WHERE NOT EXISTS (SELECT 1 FROM public.exchange_rates);

WITH seed_days AS (
  SELECT * FROM (VALUES
    (13, 3782.40, 11400.00, 8600.00, 0.00),
    (12, 3791.10, 11450.00, 8650.00, 0.67),
    (11, 3785.50, 11500.00, 8700.00, 0.29),
    (10, 3802.20, 11550.00, 8700.00, 0.88),
    (9,  3810.00, 11600.00, 8750.00, 0.64),
    (8,  3806.40, 11650.00, 8750.00, 0.34),
    (7,  3818.80, 11700.00, 8800.00, 0.76),
    (6,  3826.50, 11750.00, 8800.00, 0.63),
    (5,  3822.10, 11800.00, 8850.00, 0.31),
    (4,  3834.00, 11850.00, 8900.00, 0.74),
    (3,  3842.60, 11900.00, 8900.00, 0.65),
    (2,  3849.30, 11950.00, 8950.00, 0.60),
    (1,  3855.90, 12000.00, 9000.00, 0.59),
    (0,  3861.17, 12000.00, 9000.00, 0.14)
  ) AS t(days_ago, ounce_usd, parallel_usd_sdg, official_usd_sdg, change_pct)
),
computed AS (
  SELECT
    NOW() - (days_ago || ' days')::INTERVAL AS recorded_at,
    ounce_usd,
    parallel_usd_sdg,
    official_usd_sdg,
    ROUND((ounce_usd / 31.1035) * parallel_usd_sdg, 2) AS karat_24_sdg,
    ROUND(((ounce_usd / 31.1035) * parallel_usd_sdg) * 0.9167, 2) AS karat_22_sdg,
    ROUND(((ounce_usd / 31.1035) * parallel_usd_sdg) * 0.875, 2) AS karat_21_sdg,
    ROUND(((ounce_usd / 31.1035) * parallel_usd_sdg) * 0.75, 2) AS karat_18_sdg,
    ROUND((((ounce_usd / 31.1035) * parallel_usd_sdg) * 0.875) * 8, 2) AS gold_pound_sdg,
    15000.00 AS craftsmanship_sdg,
    change_pct,
    'initial_seed' AS source,
    'بيانات افتتاحية لآخر 14 يوماً' AS notes
  FROM seed_days
)
INSERT INTO public.gold_prices (
  recorded_at,
  ounce_usd,
  parallel_usd_sdg,
  official_usd_sdg,
  karat_24_sdg,
  karat_22_sdg,
  karat_21_sdg,
  karat_18_sdg,
  gold_pound_sdg,
  craftsmanship_sdg,
  change_pct,
  source,
  notes
)
SELECT
  recorded_at,
  ounce_usd,
  parallel_usd_sdg,
  official_usd_sdg,
  karat_24_sdg,
  karat_22_sdg,
  karat_21_sdg,
  karat_18_sdg,
  gold_pound_sdg,
  craftsmanship_sdg,
  change_pct,
  source,
  notes
FROM computed
WHERE NOT EXISTS (SELECT 1 FROM public.gold_prices);

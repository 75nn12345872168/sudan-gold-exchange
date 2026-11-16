export type KaratKey = "24" | "22" | "21" | "18" | "pound";

export type WeightUnit = "gram" | "tola" | "ounce";

export type PricingTier = "parallel" | "official";

export interface GoldPriceRecord {
  id: string;
  recorded_at: string;
  ounce_usd: number;
  parallel_usd_sdg: number;
  official_usd_sdg: number;
  karat_24_sdg: number;
  karat_22_sdg: number;
  karat_21_sdg: number;
  karat_18_sdg: number;
  gold_pound_sdg: number;
  craftsmanship_sdg: number;
  change_pct: number;
  source: string;
  notes?: string | null;
}

export interface ExchangeRateRecord {
  id: string;
  recorded_at: string;
  parallel_usd_sdg: number;
  official_usd_sdg: number;
  craftsmanship_sdg: number;
  source: string;
  notes?: string | null;
}

export interface ComputedKarats {
  karat_24_sdg: number;
  karat_22_sdg: number;
  karat_21_sdg: number;
  karat_18_sdg: number;
  gold_pound_sdg: number;
}

export interface DashboardData {
  latest: GoldPriceRecord;
  history: GoldPriceRecord[];
  latestExchangeRate: ExchangeRateRecord;
  isFallback: boolean;
  dataSourceLabel: string;
}

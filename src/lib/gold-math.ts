import type { ComputedKarats, KaratKey, WeightUnit } from "./types";

export const TROY_OUNCE_GRAMS = 31.1035;
export const TOLA_GRAMS = 11.6638;
export const GOLD_POUND_GRAMS = 8;
export const NISAB_24K_GRAMS = 85;
export const ZAKAT_RATE = 0.025;

export const KARAT_PURITY_FACTORS: Record<Exclude<KaratKey, "pound">, number> = {
  "24": 1,
  "22": 0.9167,
  "21": 0.875,
  "18": 0.75,
};

export const UNIT_TO_GRAMS: Record<WeightUnit, number> = {
  gram: 1,
  tola: TOLA_GRAMS,
  ounce: TROY_OUNCE_GRAMS,
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Compute all Sudan gold karat prices (SDG) from global ounce price (USD)
 * and a USD/SDG exchange rate.
 */
export function calculateKaratsFromUsdSdg(
  ounceUsd: number,
  usdSdg: number
): ComputedKarats {
  const karat24 = (ounceUsd / TROY_OUNCE_GRAMS) * usdSdg;
  const karat22 = karat24 * 0.9167;
  const karat21 = karat24 * 0.875;
  const karat18 = karat24 * 0.75;
  const goldPound = karat21 * GOLD_POUND_GRAMS;

  return {
    karat_24_sdg: round2(karat24),
    karat_22_sdg: round2(karat22),
    karat_21_sdg: round2(karat21),
    karat_18_sdg: round2(karat18),
    gold_pound_sdg: round2(goldPound),
  };
}

export function calculateChangePct(
  currentKarat24: number,
  previousKarat24?: number | null
): number {
  if (!previousKarat24 || previousKarat24 <= 0) {
    return 0;
  }
  return round2(((currentKarat24 - previousKarat24) / previousKarat24) * 100);
}

export function formatSdg(amount: number, showDecimals = false): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: showDecimals ? 2 : 0,
    maximumFractionDigits: showDecimals ? 2 : 0,
  }).format(showDecimals ? amount : Math.round(amount));
}

export function formatUsd(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatChangePct(changePct: number): string {
  const sign = changePct > 0 ? "+" : "";
  return `${sign}${changePct.toFixed(2)}%`;
}

export function formatArabicDateTime(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return isoDate;
  }
  return new Intl.DateTimeFormat("ar-SD", {
    timeZone: "Africa/Khartoum",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function formatArabicShortDate(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return isoDate;
  }
  return new Intl.DateTimeFormat("ar-SD", {
    timeZone: "Africa/Khartoum",
    month: "short",
    day: "numeric",
  }).format(date);
}

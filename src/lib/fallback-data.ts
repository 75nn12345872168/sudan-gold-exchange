import { calculateChangePct, calculateKaratsFromUsdSdg } from "./gold-math";
import type { ExchangeRateRecord, GoldPriceRecord } from "./types";

interface SeedPoint {
  daysAgo: number;
  ounceUsd: number;
  parallelUsdSdg: number;
  officialUsdSdg: number;
}

// 30-day realistic baseline (ensuring >= 14 days of smooth initial chart data)
const BASELINE_SERIES: SeedPoint[] = [
  { daysAgo: 29, ounceUsd: 3715.2, parallelUsdSdg: 10900, officialUsdSdg: 8200 },
  { daysAgo: 28, ounceUsd: 3724.8, parallelUsdSdg: 10950, officialUsdSdg: 8250 },
  { daysAgo: 27, ounceUsd: 3719.0, parallelUsdSdg: 10980, officialUsdSdg: 8250 },
  { daysAgo: 26, ounceUsd: 3732.4, parallelUsdSdg: 11020, officialUsdSdg: 8300 },
  { daysAgo: 25, ounceUsd: 3741.1, parallelUsdSdg: 11050, officialUsdSdg: 8300 },
  { daysAgo: 24, ounceUsd: 3736.5, parallelUsdSdg: 11080, officialUsdSdg: 8350 },
  { daysAgo: 23, ounceUsd: 3749.9, parallelUsdSdg: 11120, officialUsdSdg: 8350 },
  { daysAgo: 22, ounceUsd: 3758.4, parallelUsdSdg: 11150, officialUsdSdg: 8400 },
  { daysAgo: 21, ounceUsd: 3752.0, parallelUsdSdg: 11180, officialUsdSdg: 8400 },
  { daysAgo: 20, ounceUsd: 3761.6, parallelUsdSdg: 11220, officialUsdSdg: 8450 },
  { daysAgo: 19, ounceUsd: 3769.3, parallelUsdSdg: 11250, officialUsdSdg: 8450 },
  { daysAgo: 18, ounceUsd: 3765.8, parallelUsdSdg: 11280, officialUsdSdg: 8500 },
  { daysAgo: 17, ounceUsd: 3774.2, parallelUsdSdg: 11320, officialUsdSdg: 8500 },
  { daysAgo: 16, ounceUsd: 3770.5, parallelUsdSdg: 11350, officialUsdSdg: 8550 },
  { daysAgo: 15, ounceUsd: 3778.0, parallelUsdSdg: 11380, officialUsdSdg: 8550 },
  { daysAgo: 14, ounceUsd: 3775.7, parallelUsdSdg: 11400, officialUsdSdg: 8600 },
  { daysAgo: 13, ounceUsd: 3782.4, parallelUsdSdg: 11420, officialUsdSdg: 8600 },
  { daysAgo: 12, ounceUsd: 3791.1, parallelUsdSdg: 11450, officialUsdSdg: 8650 },
  { daysAgo: 11, ounceUsd: 3785.5, parallelUsdSdg: 11500, officialUsdSdg: 8700 },
  { daysAgo: 10, ounceUsd: 3802.2, parallelUsdSdg: 11550, officialUsdSdg: 8700 },
  { daysAgo: 9, ounceUsd: 3810.0, parallelUsdSdg: 11600, officialUsdSdg: 8750 },
  { daysAgo: 8, ounceUsd: 3806.4, parallelUsdSdg: 11650, officialUsdSdg: 8750 },
  { daysAgo: 7, ounceUsd: 3818.8, parallelUsdSdg: 11700, officialUsdSdg: 8800 },
  { daysAgo: 6, ounceUsd: 3826.5, parallelUsdSdg: 11750, officialUsdSdg: 8800 },
  { daysAgo: 5, ounceUsd: 3822.1, parallelUsdSdg: 11800, officialUsdSdg: 8850 },
  { daysAgo: 4, ounceUsd: 3834.0, parallelUsdSdg: 11850, officialUsdSdg: 8900 },
  { daysAgo: 3, ounceUsd: 3842.6, parallelUsdSdg: 11900, officialUsdSdg: 8900 },
  { daysAgo: 2, ounceUsd: 3849.3, parallelUsdSdg: 11950, officialUsdSdg: 8950 },
  { daysAgo: 1, ounceUsd: 3855.9, parallelUsdSdg: 12000, officialUsdSdg: 9000 },
  { daysAgo: 0, ounceUsd: 3861.17, parallelUsdSdg: 12000, officialUsdSdg: 9000 },
];

export function buildFallbackGoldHistory(): GoldPriceRecord[] {
  const now = Date.now();
  const records: GoldPriceRecord[] = [];

  for (let i = 0; i < BASELINE_SERIES.length; i++) {
    const point = BASELINE_SERIES[i];
    const timestamp = new Date(
      now - point.daysAgo * 24 * 60 * 60 * 1000
    ).toISOString();
    const karats = calculateKaratsFromUsdSdg(
      point.ounceUsd,
      point.parallelUsdSdg
    );
    const prevKarat24 = i > 0 ? records[i - 1].karat_24_sdg : null;
    const changePct = calculateChangePct(karats.karat_24_sdg, prevKarat24);

    records.push({
      id: `seed-${point.daysAgo}`,
      recorded_at: timestamp,
      ounce_usd: point.ounceUsd,
      parallel_usd_sdg: point.parallelUsdSdg,
      official_usd_sdg: point.officialUsdSdg,
      ...karats,
      craftsmanship_sdg: 15000,
      change_pct: changePct,
      source: "initial_baseline",
      notes: "بيانات مرجعية افتتاحية لحين تفعيل المزامنة الحية",
    });
  }

  return records;
}

export function buildFallbackExchangeRate(): ExchangeRateRecord {
  const last = BASELINE_SERIES[BASELINE_SERIES.length - 1];
  return {
    id: "seed-fx-latest",
    recorded_at: new Date().toISOString(),
    parallel_usd_sdg: last.parallelUsdSdg,
    official_usd_sdg: last.officialUsdSdg,
    craftsmanship_sdg: 15000,
    source: "initial_baseline",
    notes: "سعر الصرف الافتتاحي المعتمد في السوق الموازي والرسمي",
  };
}

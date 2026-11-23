import { getOrRefreshCachedLiveSync } from "./auto-sync";
import {
  buildFallbackExchangeRate,
  buildFallbackGoldHistory,
} from "./fallback-data";
import { createPublicSupabaseClient } from "./supabase";
import type {
  DashboardData,
  ExchangeRateRecord,
  GoldPriceRecord,
} from "./types";

const STALE_THRESHOLD_MS = 60 * 60 * 1000; // Refresh automatically if DB reading is >= 60m old

function toNum(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeGoldRow(row: Record<string, unknown>): GoldPriceRecord {
  return {
    id: String(row.id ?? ""),
    recorded_at: String(row.recorded_at ?? new Date().toISOString()),
    ounce_usd: toNum(row.ounce_usd),
    parallel_usd_sdg: toNum(row.parallel_usd_sdg),
    official_usd_sdg: toNum(row.official_usd_sdg),
    karat_24_sdg: toNum(row.karat_24_sdg),
    karat_22_sdg: toNum(row.karat_22_sdg),
    karat_21_sdg: toNum(row.karat_21_sdg),
    karat_18_sdg: toNum(row.karat_18_sdg),
    gold_pound_sdg: toNum(row.gold_pound_sdg),
    craftsmanship_sdg: toNum(row.craftsmanship_sdg, 15000),
    change_pct: toNum(row.change_pct, 0),
    source: String(row.source ?? "supabase"),
    notes: row.notes ? String(row.notes) : null,
  };
}

function normalizeExchangeRow(row: Record<string, unknown>): ExchangeRateRecord {
  return {
    id: String(row.id ?? ""),
    recorded_at: String(row.recorded_at ?? new Date().toISOString()),
    parallel_usd_sdg: toNum(row.parallel_usd_sdg),
    official_usd_sdg: toNum(row.official_usd_sdg),
    craftsmanship_sdg: toNum(row.craftsmanship_sdg, 15000),
    source: String(row.source ?? "supabase"),
    notes: row.notes ? String(row.notes) : null,
  };
}

function mergeChartHistory(
  baseHistory: GoldPriceRecord[],
  liveLatest: GoldPriceRecord
): GoldPriceRecord[] {
  const last = baseHistory[baseHistory.length - 1];
  if (!last) return [liveLatest];
  const lastTs = new Date(last.recorded_at).getTime();
  const liveTs = new Date(liveLatest.recorded_at).getTime();
  if (Math.abs(liveTs - lastTs) < 5 * 60 * 1000) {
    return [...baseHistory.slice(0, -1), liveLatest];
  }
  return [...baseHistory, liveLatest];
}

export async function getDashboardData(): Promise<DashboardData> {
  const fallbackHistory = buildFallbackGoldHistory();
  const fallbackLatest = fallbackHistory[fallbackHistory.length - 1];
  const fallbackFx = buildFallbackExchangeRate();

  const supabase = createPublicSupabaseClient();
  if (!supabase) {
    const live = await getOrRefreshCachedLiveSync({
      baselineParallel: fallbackLatest.parallel_usd_sdg,
      baselineOfficial: fallbackLatest.official_usd_sdg,
      baselineCraftsmanship: fallbackLatest.craftsmanship_sdg,
      previousKarat24:
        fallbackHistory.length >= 2
          ? fallbackHistory[fallbackHistory.length - 2].karat_24_sdg
          : null,
      persistToSupabase: false,
    });

    if (live) {
      return {
        latest: live.gold,
        history: mergeChartHistory(fallbackHistory, live.gold),
        latestExchangeRate: live.exchangeRate,
        isFallback: false,
        dataSourceLabel: "تحديث تلقائي حي • متوسط السوق الموازي والأونصة",
      };
    }

    return {
      latest: fallbackLatest,
      history: fallbackHistory,
      latestExchangeRate: fallbackFx,
      isFallback: true,
      dataSourceLabel: "بيانات مرجعية أولية",
    };
  }

  try {
    const thirtyFiveDaysAgo = new Date(
      Date.now() - 35 * 24 * 60 * 60 * 1000
    ).toISOString();

    const [{ data: goldRows, error: goldError }, { data: fxRows }] =
      await Promise.all([
        supabase
          .from("gold_prices")
          .select("*")
          .gte("recorded_at", thirtyFiveDaysAgo)
          .order("recorded_at", { ascending: true })
          .limit(120),
        supabase
          .from("exchange_rates")
          .select("*")
          .order("recorded_at", { ascending: false })
          .limit(10),
      ]);

    const validFxRow = (fxRows ?? []).find((row) => {
      const rate = toNum((row as Record<string, unknown>).parallel_usd_sdg);
      return rate >= 500 && rate <= 50000;
    }) as Record<string, unknown> | undefined;

    const latestDbFx = validFxRow
      ? normalizeExchangeRow(validFxRow)
      : fallbackFx;

    if (goldError || !goldRows || goldRows.length === 0) {
      const live = await getOrRefreshCachedLiveSync({
        baselineParallel: latestDbFx.parallel_usd_sdg,
        baselineOfficial: latestDbFx.official_usd_sdg,
        baselineCraftsmanship: latestDbFx.craftsmanship_sdg,
        previousKarat24: null,
        persistToSupabase: true,
      });

      if (live) {
        return {
          latest: live.gold,
          history: mergeChartHistory(fallbackHistory, live.gold),
          latestExchangeRate: live.exchangeRate,
          isFallback: false,
          dataSourceLabel: "تحديث تلقائي حي • متوسط السوق الموازي والأونصة",
        };
      }

      return {
        latest: fallbackLatest,
        history: fallbackHistory,
        latestExchangeRate: latestDbFx,
        isFallback: true,
        dataSourceLabel: "بيانات مرجعية لآخر 30 يوماً (بانتظار أول مزامنة)",
      };
    }

    const normalizedHistory = goldRows
      .map((row) => normalizeGoldRow(row as Record<string, unknown>))
      .filter((row) => row.parallel_usd_sdg >= 500 && row.parallel_usd_sdg <= 50000);

    if (normalizedHistory.length === 0) {
      return {
        latest: fallbackLatest,
        history: fallbackHistory,
        latestExchangeRate: latestDbFx,
        isFallback: true,
        dataSourceLabel: "بيانات مرجعية أولية",
      };
    }

    let latest = normalizedHistory[normalizedHistory.length - 1];
    let chartHistory = normalizedHistory;
    if (normalizedHistory.length < 7) {
      const earliestLiveTs = new Date(normalizedHistory[0].recorded_at).getTime();
      const olderSeed = fallbackHistory.filter(
        (item) => new Date(item.recorded_at).getTime() < earliestLiveTs - 3600_000
      );
      chartHistory = [...olderSeed, ...normalizedHistory];
    }

    let latestExchangeRate: ExchangeRateRecord = validFxRow
      ? latestDbFx
      : {
          id: "derived-from-gold",
          recorded_at: latest.recorded_at,
          parallel_usd_sdg: latest.parallel_usd_sdg,
          official_usd_sdg: latest.official_usd_sdg,
          craftsmanship_sdg: latest.craftsmanship_sdg,
          source: latest.source,
          notes: latest.notes,
        };

    // Auto-refresh automatically if latest Supabase record is >= 60 minutes old
    const ageMs = Date.now() - new Date(latest.recorded_at).getTime();
    if (Number.isNaN(ageMs) || ageMs >= STALE_THRESHOLD_MS) {
      const live = await getOrRefreshCachedLiveSync({
        baselineParallel: latestExchangeRate.parallel_usd_sdg,
        baselineOfficial: latestExchangeRate.official_usd_sdg,
        baselineCraftsmanship: latestExchangeRate.craftsmanship_sdg,
        previousKarat24: latest.karat_24_sdg,
        persistToSupabase: true,
      });

      if (live) {
        latest = live.gold;
        latestExchangeRate = live.exchangeRate;
        chartHistory = mergeChartHistory(chartHistory, live.gold);
      }
    }

    return {
      latest,
      history: chartHistory,
      latestExchangeRate,
      isFallback: false,
      dataSourceLabel: "بيانات حية متصلة ومحدّثة تلقائياً",
    };
  } catch {
    const live = await getOrRefreshCachedLiveSync({
      baselineParallel: fallbackLatest.parallel_usd_sdg,
      baselineOfficial: fallbackLatest.official_usd_sdg,
      baselineCraftsmanship: fallbackLatest.craftsmanship_sdg,
      persistToSupabase: false,
    });

    if (live) {
      return {
        latest: live.gold,
        history: mergeChartHistory(fallbackHistory, live.gold),
        latestExchangeRate: live.exchangeRate,
        isFallback: false,
        dataSourceLabel: "تحديث تلقائي حي • متوسط السوق الموازي والأونصة",
      };
    }

    return {
      latest: fallbackLatest,
      history: fallbackHistory,
      latestExchangeRate: fallbackFx,
      isFallback: true,
      dataSourceLabel: "بيانات مرجعية أولية",
    };
  }
}

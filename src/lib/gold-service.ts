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

export async function getDashboardData(): Promise<DashboardData> {
  const fallbackHistory = buildFallbackGoldHistory();
  const fallbackLatest = fallbackHistory[fallbackHistory.length - 1];
  const fallbackFx = buildFallbackExchangeRate();

  const supabase = createPublicSupabaseClient();
  if (!supabase) {
    return {
      latest: fallbackLatest,
      history: fallbackHistory,
      latestExchangeRate: fallbackFx,
      isFallback: true,
      dataSourceLabel: "بيانات مرجعية أولية (بانتظار ربط Supabase)",
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
          .limit(1),
      ]);

    if (goldError || !goldRows || goldRows.length === 0) {
      return {
        latest: fallbackLatest,
        history: fallbackHistory,
        latestExchangeRate:
          fxRows && fxRows.length > 0
            ? normalizeExchangeRow(fxRows[0] as Record<string, unknown>)
            : fallbackFx,
        isFallback: true,
        dataSourceLabel: "بيانات مرجعية لآخر 30 يوماً (بانتظار أول مزامنة)",
      };
    }

    const normalizedHistory = goldRows.map((row) =>
      normalizeGoldRow(row as Record<string, unknown>)
    );
    const latest = normalizedHistory[normalizedHistory.length - 1];

    // If Supabase only has 1-2 records so far, prepend older fallback points
    // before the earliest live record so the 7/30-day chart never looks empty.
    let chartHistory = normalizedHistory;
    if (normalizedHistory.length < 7) {
      const earliestLiveTs = new Date(normalizedHistory[0].recorded_at).getTime();
      const olderSeed = fallbackHistory.filter(
        (item) => new Date(item.recorded_at).getTime() < earliestLiveTs - 3600_000
      );
      chartHistory = [...olderSeed, ...normalizedHistory];
    }

    const latestExchangeRate =
      fxRows && fxRows.length > 0
        ? normalizeExchangeRow(fxRows[0] as Record<string, unknown>)
        : {
            id: "derived-from-gold",
            recorded_at: latest.recorded_at,
            parallel_usd_sdg: latest.parallel_usd_sdg,
            official_usd_sdg: latest.official_usd_sdg,
            craftsmanship_sdg: latest.craftsmanship_sdg,
            source: latest.source,
            notes: latest.notes,
          };

    return {
      latest,
      history: chartHistory,
      latestExchangeRate,
      isFallback: false,
      dataSourceLabel: "بيانات حية متصلة بقاعدة البيانات",
    };
  } catch {
    return {
      latest: fallbackLatest,
      history: fallbackHistory,
      latestExchangeRate: fallbackFx,
      isFallback: true,
      dataSourceLabel: "بيانات مرجعية أولية",
    };
  }
}

import {
  calculateChangePct,
  calculateKaratsFromUsdSdg,
} from "./gold-math";
import { fetchLiveMarketSnapshot } from "./parallel-fx";
import { createAdminSupabaseClient } from "./supabase";
import { formatGoldBulletinArabic, sendTelegramBulletin } from "./telegram";
import type { ExchangeRateRecord, GoldPriceRecord } from "./types";

const LIVE_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

interface CachedLiveSync {
  timestamp: number;
  gold: GoldPriceRecord;
  exchangeRate: ExchangeRateRecord;
}

declare global {
  // eslint-disable-next-line no-var
  var __sudanGoldAutoSyncCache: CachedLiveSync | undefined;
  // eslint-disable-next-line no-var
  var __sudanGoldAutoSyncInFlight: Promise<CachedLiveSync | null> | undefined;
}

export interface AutoSyncOptions {
  baselineParallel?: number;
  baselineOfficial?: number;
  baselineCraftsmanship?: number;
  previousKarat24?: number | null;
  persistToSupabase?: boolean;
  sendTelegram?: boolean;
  forceRefresh?: boolean;
}

export interface AutoSyncResult {
  gold: GoldPriceRecord;
  exchangeRate: ExchangeRateRecord;
  persisted: boolean;
  telegram?: { sent: boolean; reason?: string };
}

function getEnvDefaults() {
  return {
    parallel: Number(process.env.DEFAULT_PARALLEL_USD_SDG ?? "12000") || 12000,
    official: Number(process.env.DEFAULT_OFFICIAL_USD_SDG ?? "9000") || 9000,
    craftsmanship:
      Number(process.env.DEFAULT_CRAFTSMANSHIP_SDG ?? "15000") || 15000,
  };
}

function hasAdminSupabaseEnv(): boolean {
  const url =
    process.env.SUPABASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  return Boolean(url && key);
}

export async function runAutoMarketSync(
  options: AutoSyncOptions = {}
): Promise<AutoSyncResult | null> {
  const defaults = getEnvDefaults();
  const baselineParallel =
    options.baselineParallel && options.baselineParallel >= 500
      ? options.baselineParallel
      : defaults.parallel;
  const baselineOfficial =
    options.baselineOfficial && options.baselineOfficial >= 500
      ? options.baselineOfficial
      : defaults.official;
  const craftsmanshipSdg =
    options.baselineCraftsmanship !== undefined &&
    options.baselineCraftsmanship >= 0
      ? options.baselineCraftsmanship
      : defaults.craftsmanship;

  const snapshot = await fetchLiveMarketSnapshot(
    baselineParallel,
    baselineOfficial
  );
  if (!snapshot) {
    return null;
  }

  const nowIso = new Date().toISOString();
  const computed = calculateKaratsFromUsdSdg(
    snapshot.ounceUsd,
    snapshot.fx.rate
  );
  const changePct = calculateChangePct(
    computed.karat_24_sdg,
    options.previousKarat24
  );

  const sourceTag = `auto_live:${snapshot.ounceProvider}|fx:${snapshot.fx.source}`;
  const gold: GoldPriceRecord = {
    id: `live-${Date.now()}`,
    recorded_at: nowIso,
    ounce_usd: snapshot.ounceUsd,
    parallel_usd_sdg: snapshot.fx.rate,
    official_usd_sdg: snapshot.officialUsdSdg,
    ...computed,
    craftsmanship_sdg: craftsmanshipSdg,
    change_pct: changePct,
    source: sourceTag,
    notes: snapshot.fx.note,
  };

  const exchangeRate: ExchangeRateRecord = {
    id: `live-fx-${Date.now()}`,
    recorded_at: nowIso,
    parallel_usd_sdg: snapshot.fx.rate,
    official_usd_sdg: snapshot.officialUsdSdg,
    craftsmanship_sdg: craftsmanshipSdg,
    source: `auto_scraper:${snapshot.fx.source}`,
    notes: snapshot.fx.note,
  };

  let persisted = false;
  if (options.persistToSupabase !== false && hasAdminSupabaseEnv()) {
    try {
      const supabase = createAdminSupabaseClient();

      if (snapshot.fx.updated) {
        await supabase.from("exchange_rates").insert({
          recorded_at: nowIso,
          parallel_usd_sdg: snapshot.fx.rate,
          official_usd_sdg: snapshot.officialUsdSdg,
          craftsmanship_sdg: craftsmanshipSdg,
          source: exchangeRate.source,
          notes: snapshot.fx.note,
        });
      }

      const { data: insertedGold } = await supabase
        .from("gold_prices")
        .insert({
          recorded_at: nowIso,
          ounce_usd: gold.ounce_usd,
          parallel_usd_sdg: gold.parallel_usd_sdg,
          official_usd_sdg: gold.official_usd_sdg,
          ...computed,
          craftsmanship_sdg: craftsmanshipSdg,
          change_pct: changePct,
          source: sourceTag,
          notes: snapshot.fx.note,
        })
        .select("id")
        .single();

      if (insertedGold?.id) {
        gold.id = String(insertedGold.id);
        persisted = true;
      }
    } catch {
      // Non-fatal: still return live calculated prices to visitors
    }
  }

  globalThis.__sudanGoldAutoSyncCache = {
    timestamp: Date.now(),
    gold,
    exchangeRate,
  };

  let telegram: { sent: boolean; reason?: string } | undefined;
  if (options.sendTelegram) {
    const bulletin = formatGoldBulletinArabic(gold);
    telegram = await sendTelegramBulletin(bulletin);
  }

  return {
    gold,
    exchangeRate,
    persisted,
    telegram,
  };
}

export async function getOrRefreshCachedLiveSync(
  options: AutoSyncOptions = {}
): Promise<CachedLiveSync | null> {
  const cached = globalThis.__sudanGoldAutoSyncCache;
  if (
    !options.forceRefresh &&
    cached &&
    Date.now() - cached.timestamp < LIVE_CACHE_TTL_MS
  ) {
    return cached;
  }

  if (globalThis.__sudanGoldAutoSyncInFlight) {
    return globalThis.__sudanGoldAutoSyncInFlight;
  }

  globalThis.__sudanGoldAutoSyncInFlight = (async () => {
    try {
      const res = await runAutoMarketSync(options);
      if (!res) return null;
      return {
        timestamp: Date.now(),
        gold: res.gold,
        exchangeRate: res.exchangeRate,
      };
    } finally {
      globalThis.__sudanGoldAutoSyncInFlight = undefined;
    }
  })();

  return globalThis.__sudanGoldAutoSyncInFlight;
}

export interface SpotGoldResult {
  ounceUsd: number;
  provider: string;
}

const FETCH_HEADERS = {
  "User-Agent": "SudanGoldExchange/1.0 (+https://sudan-gold-exchange.vercel.app)",
  Accept: "application/json",
};

async function tryGoldApi(): Promise<SpotGoldResult | null> {
  const res = await fetch("https://api.gold-api.com/price/XAU", {
    headers: FETCH_HEADERS,
    cache: "no-store",
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { price?: number };
  if (typeof data.price === "number" && data.price > 1000) {
    return { ounceUsd: Math.round(data.price * 100) / 100, provider: "gold-api" };
  }
  return null;
}

async function tryMetalsLive(): Promise<SpotGoldResult | null> {
  const res = await fetch("https://api.metals.live/v1/spot/gold", {
    headers: FETCH_HEADERS,
    cache: "no-store",
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as Array<{ price?: number } | number>;
  const first = Array.isArray(data) ? data[0] : null;
  const price = typeof first === "number" ? first : first?.price;
  if (typeof price === "number" && price > 1000) {
    return { ounceUsd: Math.round(price * 100) / 100, provider: "metals.live" };
  }
  return null;
}

async function tryYahooFinance(symbol: string): Promise<SpotGoldResult | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`;
  const res = await fetch(url, {
    headers: FETCH_HEADERS,
    cache: "no-store",
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    chart?: {
      result?: Array<{
        meta?: { regularMarketPrice?: number };
      }>;
    };
  };
  const price = data.chart?.result?.[0]?.meta?.regularMarketPrice;
  if (typeof price === "number" && price > 1000) {
    return {
      ounceUsd: Math.round(price * 100) / 100,
      provider: `yahoo:${symbol}`,
    };
  }
  return null;
}

export async function fetchLiveSpotGoldUsd(): Promise<SpotGoldResult> {
  const providers: Array<() => Promise<SpotGoldResult | null>> = [
    tryGoldApi,
    tryMetalsLive,
    () => tryYahooFinance("GC=F"),
    () => tryYahooFinance("XAUUSD=X"),
  ];

  for (const fetcher of providers) {
    try {
      const result = await fetcher();
      if (result) return result;
    } catch {
      // Try next provider
    }
  }

  throw new Error("تعذر جلب سعر الأونصة العالمي من جميع المصادر الاحتياطية حالياً.");
}

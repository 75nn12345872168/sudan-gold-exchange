import { fetchLiveSpotGoldUsd } from "./spot-gold";

const MIN_VALID_SDG = 500;
const MAX_VALID_SDG = 50000;
const DEFAULT_MAX_DEVIATION_RATIO = 0.25;
const INTER_SOURCE_SPREAD_RATIO = 0.15;
const MAX_ARTICLE_AGE_MS = 72 * 60 * 60 * 1000;

const SCRAPER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/json,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "ar,en;q=0.8",
};

const DEFAULT_PUBLIC_SOURCES: Array<{ name: string; url: string }> = [
  {
    name: "sudanakhbar:wp-json",
    url: "https://www.sudanakhbar.com/wp-json/wp/v2/posts?per_page=15&_fields=date_gmt,title,content",
  },
  {
    name: "dabangasudan:wp-json",
    url: "https://www.dabangasudan.org/ar/wp-json/wp/v2/posts?per_page=10&_fields=date_gmt,title,content",
  },
  {
    name: "altaghyeer:rss",
    url: "https://www.altaghyeer.info/ar/tag/%d8%a3%d8%b3%d8%b9%d8%a7%d8%b1-%d8%a7%d9%84%d8%b9%d9%85%d9%84%d8%a7%d8%aa/feed/",
  },
  {
    name: "kushnews:wp-json",
    url: "https://kushnews.net/wp-json/wp/v2/posts?per_page=10&_fields=date_gmt,title,content",
  },
  {
    name: "alsoug:currency",
    url: "https://www.alsoug.com/currency",
  },
];

export interface RateSample {
  source: string;
  rate: number;
}

export interface ParallelFxResult {
  rate: number;
  source: string;
  updated: boolean;
  note: string;
  samples: RateSample[];
}

const ARABIC_INDIC = "٠١٢٣٤٥٦٧٨٩";
const PERSIAN_INDIC = "۰۱۲۳۴۵۶۷۸۹";

function normalizeDigits(text: string): string {
  let out = "";
  for (const ch of text) {
    const aIdx = ARABIC_INDIC.indexOf(ch);
    if (aIdx !== -1) {
      out += String(aIdx);
      continue;
    }
    const pIdx = PERSIAN_INDIC.indexOf(ch);
    if (pIdx !== -1) {
      out += String(pIdx);
      continue;
    }
    if (ch === "٬") {
      out += ",";
    } else if (ch === "٫") {
      out += ".";
    } else {
      out += ch;
    }
  }
  return out;
}

function stripHtml(rawHtml: string): string {
  return rawHtml
    .replace(/<(script|style|noscript)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#8211;|&ndash;/gi, "-")
    .replace(/&#8230;/gi, "...")
    .replace(/\s+/g, " ")
    .trim();
}

function parseNumber(raw: string | undefined): number | null {
  if (!raw) return null;
  const val = Number(raw.replace(/,/g, "").trim());
  if (Number.isFinite(val) && val > 0) {
    return Math.round(val * 100) / 100;
  }
  return null;
}

function isRecentDate(dateStr: string | undefined | null): boolean {
  if (!dateStr) return true;
  const parsed = Date.parse(dateStr);
  if (Number.isNaN(parsed)) return true;
  return Date.now() - parsed <= MAX_ARTICLE_AGE_MS;
}

export function isSaneParallelRate(
  candidate: number | null,
  baselineRate: number | null,
  maxDeviationRatio = DEFAULT_MAX_DEVIATION_RATIO
): boolean {
  if (candidate === null || !Number.isFinite(candidate) || candidate <= 0) {
    return false;
  }
  if (candidate < MIN_VALID_SDG || candidate > MAX_VALID_SDG) {
    return false;
  }
  if (
    baselineRate !== null &&
    baselineRate >= MIN_VALID_SDG &&
    baselineRate <= MAX_VALID_SDG
  ) {
    const deviation = Math.abs(candidate - baselineRate) / baselineRate;
    if (deviation > maxDeviationRatio) {
      return false;
    }
  }
  return true;
}

function isNonParallelArticle(text: string): boolean {
  const hasParallelKw =
    text.includes("السوق الموازي") ||
    text.includes("السوق الموازية") ||
    text.includes("السوق السوداء") ||
    text.includes("السوق الأسود") ||
    text.includes("الموازي");
  const isBankOrCustoms =
    text.includes("من البنوك") ||
    text.includes("القنوات المصرفية") ||
    text.includes("لدى البنوك") ||
    text.includes("الدولار الجمركي");
  return isBankOrCustoms && !hasParallelKw;
}

export function parseUsdSdgFromText(
  text: string,
  baselineRate: number | null,
  maxDeviationRatio = DEFAULT_MAX_DEVIATION_RATIO
): number | null {
  const normalized = normalizeDigits(text);
  if (isNonParallelArticle(normalized)) {
    return null;
  }

  const numPat = "((?:\\d{1,3}(?:,\\d{3})+|\\d{3,5})(?:\\.\\d{1,2})?)";

  // Priority 0: Buy + Sell pair (compute midpoint average)
  const pairRegexes = [
    new RegExp(
      `(?:الدولار(?:\\s*الأمريكي|\\s*الامريكي)?|USD)[^.\\n]{0,45}?(?:الشراء|شراء)\\s*[:=\\-]?\\s*${numPat}[^.\\n]{0,30}?(?:البيع|بيع)\\s*[:=\\-]?\\s*${numPat}`,
      "i"
    ),
    new RegExp(
      `(?:متوسط\\s*بيع\\s*الدولار|بيع\\s*الدولار)(?:[^0-9]{0,35}?من\\s*${numPat}\\s*(?:جنيه(?:اً)?)?\\s*إلى\\s*|[^0-9]{0,25})${numPat}[^.\\n]{0,90}?(?:متوسط\\s*الشراء|الشراء|شراء)(?:[^0-9]{0,35}?من\\s*${numPat}\\s*(?:جنيه(?:اً)?)?\\s*إلى\\s*|[^0-9]{0,25})${numPat}`,
      "i"
    ),
    new RegExp(
      `(?:متوسط\\s*شراء\\s*الدولار|الشراء|شراء)(?:[^0-9]{0,35}?من\\s*${numPat}\\s*(?:جنيه(?:اً)?)?\\s*إلى\\s*|[^0-9]{0,25})${numPat}[^.\\n]{0,90}?(?:متوسط\\s*البيع|البيع|بيع)(?:[^0-9]{0,35}?من\\s*${numPat}\\s*(?:جنيه(?:اً)?)?\\s*إلى\\s*|[^0-9]{0,25})${numPat}`,
      "i"
    ),
  ];

  for (let i = 0; i < pairRegexes.length; i++) {
    const match = pairRegexes[i].exec(normalized);
    if (match) {
      const snippet = match[0];
      if (!snippet.includes("الجمركي") && !snippet.includes("الرسوم الجمركية")) {
        const r1 = parseNumber(i === 0 ? match[1] : match[2]);
        const r2 = parseNumber(i === 0 ? match[2] : match[4]);
        if (
          isSaneParallelRate(r1, baselineRate, maxDeviationRatio) &&
          isSaneParallelRate(r2, baselineRate, maxDeviationRatio) &&
          r1 !== null &&
          r2 !== null
        ) {
          return Math.round(((r1 + r2) / 2) * 100) / 100;
        }
      }
    }
  }

  // Priority 1: Single explicit parallel rate quote
  const singleRegexes = [
    new RegExp(
      `(?:بيع\\s*(?:الدولار|USD)|الدولار[^.\\n]{0,40}بيع)(?:[^0-9]{0,35}?من\\s*\\d[\\d,.]*\\s*(?:جنيه(?:اً)?)?\\s*إلى\\s*|[^0-9]{0,25})${numPat}`,
      "gi"
    ),
    new RegExp(
      `(?:السوق\\s*الموازي[ة]?|السوق\\s*الأسود|السوق\\s*السوداء)[^.\\n]{0,60}(?:سعر\\s*الدولار|الدولار)[^0-9]{0,35}${numPat}`,
      "gi"
    ),
    new RegExp(
      `(?:سعر\\s*الدولار(?:\\s*الأمريكي|\\s*الامريكي|\\s*الموازي|\\s*اليوم)?(?:\\s*في\\s*السودان)?(?:\\s*في\\s*السوق\\s*الموازي[ة]?)?)[^0-9]{0,45}${numPat}`,
      "gi"
    ),
    new RegExp(
      `(?:الدولار\\s*(?:الأمريكي|الامريكي|الموازي))[^0-9]{0,35}${numPat}`,
      "gi"
    ),
    new RegExp(
      `(?:USD\\s*/\\s*SDG|USD\\s*to\\s*SDG|parallel\\s*USD)[^0-9]{0,25}${numPat}`,
      "gi"
    ),
    new RegExp(
      `${numPat}\\s*(?:جنيه(?:\\s*سوداني|اً)?|ج\\.س|SDG)[^.\\n]{0,35}(?:للدولار|الدولار|USD)`,
      "gi"
    ),
  ];

  for (const regex of singleRegexes) {
    let match: RegExpExecArray | null;
    while ((match = regex.exec(normalized)) !== null) {
      const snippet = match[0];
      if (snippet.includes("الجمركي") || snippet.includes("الرسوم الجمركية")) {
        continue;
      }
      const candidate = parseNumber(match[1]);
      if (isSaneParallelRate(candidate, baselineRate, maxDeviationRatio)) {
        return candidate;
      }
    }
  }

  return null;
}

function parseFromJson(
  payload: unknown,
  baselineRate: number | null,
  maxDeviationRatio: number
): number | null {
  if (Array.isArray(payload)) {
    const postRates: number[] = [];
    for (const item of payload) {
      const extracted = parseFromJson(item, baselineRate, maxDeviationRatio);
      if (extracted !== null) {
        if (
          typeof item === "object" &&
          item !== null &&
          "content" in item
        ) {
          postRates.push(extracted);
        } else {
          return extracted;
        }
      }
    }
    if (postRates.length > 0) {
      return (
        Math.round(
          (postRates.reduce((acc, v) => acc + v, 0) / postRates.length) * 100
        ) / 100
      );
    }
    return null;
  }

  if (typeof payload === "object" && payload !== null) {
    const obj = payload as Record<string, unknown>;

    if (
      typeof obj.content === "object" &&
      obj.content !== null &&
      "rendered" in obj.content
    ) {
      const postDate = (obj.date_gmt ?? obj.date) as string | undefined;
      if (!isRecentDate(postDate)) {
        return null;
      }
      const titleRendered =
        typeof obj.title === "object" &&
        obj.title !== null &&
        "rendered" in obj.title
          ? String((obj.title as Record<string, unknown>).rendered ?? "")
          : "";
      const contentRendered = String(
        (obj.content as Record<string, unknown>).rendered ?? ""
      );
      return parseUsdSdgFromText(
        stripHtml(`${titleRendered}. ${contentRendered}`),
        baselineRate,
        maxDeviationRatio
      );
    }

    for (const key of [
      "parallel_usd_sdg",
      "usd_sdg_rate",
      "usd_sdg",
      "sell",
      "buy",
      "rate",
      "price",
      "SDG",
    ]) {
      if (key in obj) {
        const rawVal = obj[key];
        const parsed =
          typeof rawVal === "number"
            ? Math.round(rawVal * 100) / 100
            : typeof rawVal === "string"
              ? parseNumber(normalizeDigits(rawVal))
              : null;
        if (isSaneParallelRate(parsed, baselineRate, maxDeviationRatio)) {
          return parsed;
        }
      }
    }

    for (const nestedKey of ["data", "rates", "result", "currency"]) {
      if (nestedKey in obj) {
        const nested = parseFromJson(
          obj[nestedKey],
          baselineRate,
          maxDeviationRatio
        );
        if (nested !== null) {
          return nested;
        }
      }
    }
  }

  return null;
}

function parseRssFeed(
  xml: string,
  baselineRate: number | null,
  maxDeviationRatio: number
): number | null {
  const itemMatches = xml.match(/<item>[\s\S]*?<\/item>/gi) ?? [];
  const rates: number[] = [];

  for (const item of itemMatches.slice(0, 6)) {
    const pubMatch = /<pubDate>([\s\S]*?)<\/pubDate>/i.exec(item);
    if (pubMatch && !isRecentDate(pubMatch[1].trim())) {
      continue;
    }
    const rate = parseUsdSdgFromText(
      stripHtml(item),
      baselineRate,
      maxDeviationRatio
    );
    if (rate !== null) {
      rates.push(rate);
    }
  }

  if (rates.length === 0) return null;
  return (
    Math.round((rates.reduce((a, b) => a + b, 0) / rates.length) * 100) / 100
  );
}

function parseTelegramWebPreview(
  rawHtml: string,
  baselineRate: number | null,
  maxDeviationRatio: number
): number | null {
  const matches = Array.from(
    rawHtml.matchAll(
      /<div[^>]*class="[^"]*tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/gi
    )
  );
  for (let i = matches.length - 1; i >= 0; i--) {
    const rate = parseUsdSdgFromText(
      stripHtml(matches[i][1]),
      baselineRate,
      maxDeviationRatio
    );
    if (rate !== null) return rate;
  }
  return null;
}

async function scrapeSource(
  source: { name: string; url: string },
  baselineRate: number | null,
  maxDeviationRatio: number
): Promise<RateSample | null> {
  const res = await fetch(source.url, {
    headers: SCRAPER_HEADERS,
    cache: "no-store",
    signal: AbortSignal.timeout(9000),
  });
  if (!res.ok) return null;

  const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
  const body = await res.text();
  const trimmed = body.trimStart();

  if (
    contentType.includes("application/json") ||
    trimmed.startsWith("{") ||
    trimmed.startsWith("[")
  ) {
    try {
      const json = JSON.parse(body) as unknown;
      const rate = parseFromJson(json, baselineRate, maxDeviationRatio);
      if (isSaneParallelRate(rate, baselineRate, maxDeviationRatio) && rate !== null) {
        return { source: source.name, rate };
      }
    } catch {
      // Fall through to text parsing
    }
  }

  if (contentType.includes("xml") || body.slice(0, 400).toLowerCase().includes("<rss")) {
    const rate = parseRssFeed(body, baselineRate, maxDeviationRatio);
    return rate !== null ? { source: source.name, rate } : null;
  }

  if (source.url.includes("t.me/s/")) {
    const rate = parseTelegramWebPreview(body, baselineRate, maxDeviationRatio);
    if (rate !== null) return { source: source.name, rate };
  }

  const rate = parseUsdSdgFromText(
    stripHtml(body),
    baselineRate,
    maxDeviationRatio
  );
  return rate !== null ? { source: source.name, rate } : null;
}

function buildSourceList(): Array<{ name: string; url: string }> {
  const list: Array<{ name: string; url: string }> = [];

  const multi = process.env.USD_SOURCE_URLS?.trim();
  if (multi) {
    multi
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((url, idx) => list.push({ name: `env:USD_SOURCE_${idx + 1}`, url }));
  }

  const single = process.env.USD_SOURCE_URL?.trim();
  if (single && !list.some((item) => item.url === single)) {
    list.push({ name: "env:USD_SOURCE_URL", url: single });
  }

  return [...list, ...DEFAULT_PUBLIC_SOURCES];
}

function filterInterSourceOutliers(samples: RateSample[]): RateSample[] {
  if (samples.length < 3) return samples;
  const sorted = [...samples].map((s) => s.rate).sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const med =
    sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
  const filtered = samples.filter(
    (s) => med > 0 && Math.abs(s.rate - med) / med <= INTER_SOURCE_SPREAD_RATIO
  );
  return filtered.length > 0 ? filtered : samples;
}

export async function fetchAverageParallelUsdSdg(
  baselineRate: number
): Promise<ParallelFxResult> {
  const maxDeviationRatio = Number(process.env.USD_MAX_DEVIATION_PCT ?? "0.25") || DEFAULT_MAX_DEVIATION_RATIO;
  const sources = buildSourceList();

  const settled = await Promise.allSettled(
    sources.map((src) => scrapeSource(src, baselineRate, maxDeviationRatio))
  );

  const samples: RateSample[] = [];
  for (const outcome of settled) {
    if (outcome.status === "fulfilled" && outcome.value !== null) {
      samples.push(outcome.value);
    }
  }

  if (samples.length > 0) {
    const cleanSamples = filterInterSourceOutliers(samples);
    const avgRate =
      Math.round(
        (cleanSamples.reduce((sum, s) => sum + s.rate, 0) / cleanSamples.length) *
          100
      ) / 100;
    const summary = cleanSamples
      .map((s) => `${s.source}=${Math.round(s.rate).toLocaleString("en-US")}`)
      .join("، ");
    const sourceTag =
      cleanSamples.length === 1
        ? cleanSamples[0].source
        : `avg(${cleanSamples.length}):${cleanSamples.map((s) => s.source.split(":")[0]).join("+")}`;

    return {
      rate: avgRate,
      source: sourceTag,
      updated: true,
      note: `متوسط تلقائي من ${cleanSamples.length} مصدر (${summary})`,
      samples: cleanSamples,
    };
  }

  return {
    rate: Math.round(baselineRate * 100) / 100,
    source: "baseline:retained",
    updated: false,
    note: "الاحتفاظ بآخر سعر موازي معتمد لحين توفر قراءة جديدة من المصادر",
    samples: [],
  };
}

export async function fetchLiveMarketSnapshot(
  baselineParallelUsd: number,
  baselineOfficialUsd: number
): Promise<{
  ounceUsd: number;
  ounceProvider: string;
  fx: ParallelFxResult;
  officialUsdSdg: number;
} | null> {
  try {
    const [spot, fx] = await Promise.all([
      fetchLiveSpotGoldUsd(),
      fetchAverageParallelUsdSdg(baselineParallelUsd),
    ]);
    return {
      ounceUsd: spot.ounceUsd,
      ounceProvider: spot.provider,
      fx,
      officialUsdSdg: baselineOfficialUsd,
    };
  } catch {
    return null;
  }
}

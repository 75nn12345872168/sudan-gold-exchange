"""Fault-tolerant multi-source scraper and averager for Sudan parallel USD/SDG rates."""

from __future__ import annotations

import html
import math
import os
import re
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from statistics import median
from typing import Any, Callable

import requests

MIN_VALID_SDG = 500.0
MAX_VALID_SDG = 50000.0
DEFAULT_MAX_DEVIATION_RATIO = 0.25  # +/- 25% guardrail against database baseline
DEFAULT_MAX_ARTICLE_AGE_HOURS = 72
INTER_SOURCE_SPREAD_RATIO = 0.15  # +/- 15% outlier filter across live sources

SCRAPER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/json,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "ar,en;q=0.8",
}

ARABIC_DIGITS_MAP = str.maketrans("٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹", "01234567890123456789")

DEFAULT_PUBLIC_SOURCES: list[tuple[str, str]] = [
    (
        "sudanakhbar:wp-json",
        "https://www.sudanakhbar.com/wp-json/wp/v2/posts?per_page=15&_fields=date_gmt,title,content",
    ),
    (
        "dabangasudan:wp-json",
        "https://www.dabangasudan.org/ar/wp-json/wp/v2/posts?per_page=10&_fields=date_gmt,title,content",
    ),
    (
        "altaghyeer:rss",
        "https://www.altaghyeer.info/ar/tag/%d8%a3%d8%b3%d8%b9%d8%a7%d8%b1-%d8%a7%d9%84%d8%b9%d9%85%d9%84%d8%a7%d8%AA/feed/",
    ),
    (
        "kushnews:wp-json",
        "https://kushnews.net/wp-json/wp/v2/posts?per_page=10&_fields=date_gmt,title,content",
    ),
    (
        "alsoug:currency",
        "https://www.alsoug.com/currency",
    ),
]


@dataclass(frozen=True)
class RateSample:
    source: str
    rate: float


@dataclass(frozen=True)
class ParallelRateResult:
    rate: float
    source: str
    updated: bool
    note: str
    samples: list[RateSample] = field(default_factory=list)


def normalize_digits(text: str) -> str:
    """Convert Arabic-Indic / Persian digits to ASCII and clean numeric separators."""
    cleaned = text.translate(ARABIC_DIGITS_MAP)
    cleaned = cleaned.replace("٬", ",").replace("٫", ".")
    return cleaned


def strip_html(raw_html: str) -> str:
    """Strip HTML scripts, styles, and tags into normalized readable text."""
    without_scripts = re.sub(
        r"<(script|style|noscript)[^>]*>.*?</\1>",
        " ",
        raw_html,
        flags=re.IGNORECASE | re.DOTALL,
    )
    without_tags = re.sub(r"<[^>]+>", " ", without_scripts)
    unescaped = html.unescape(without_tags)
    return re.sub(r"\s+", " ", unescaped).strip()


def _parse_number(raw: str) -> float | None:
    try:
        val = float(raw.replace(",", "").strip())
        if math.isfinite(val) and val > 0:
            return round(val, 2)
    except ValueError:
        return None
    return None


def _is_recent_iso_or_rfc(date_str: str | None, max_age_hours: int) -> bool:
    """Return True if timestamp is missing or within max_age_hours."""
    if not date_str:
        return True
    dt: datetime | None = None
    try:
        dt = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
    except ValueError:
        try:
            dt = parsedate_to_datetime(date_str)
        except Exception:  # noqa: BLE001
            return True

    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    cutoff = datetime.now(timezone.utc) - timedelta(hours=max_age_hours)
    return dt >= cutoff


def is_sane_rate(
    candidate: float | None,
    baseline_rate: float | None,
    max_deviation_ratio: float = DEFAULT_MAX_DEVIATION_RATIO,
) -> tuple[bool, str]:
    """Validate candidate SDG rate against hard bounds and +/-25% outlier guardrail."""
    if candidate is None or not math.isfinite(candidate) or candidate <= 0:
        return False, "non-positive or null rate"

    if candidate < MIN_VALID_SDG or candidate > MAX_VALID_SDG:
        return (
            False,
            f"rate {candidate} outside absolute bounds [{MIN_VALID_SDG}, {MAX_VALID_SDG}]",
        )

    if (
        baseline_rate is not None
        and MIN_VALID_SDG <= baseline_rate <= MAX_VALID_SDG
    ):
        deviation = abs(candidate - baseline_rate) / baseline_rate
        if deviation > max_deviation_ratio:
            return (
                False,
                f"outlier {candidate} deviates {deviation * 100:.1f}% from baseline {baseline_rate} (> {max_deviation_ratio * 100:.0f}%)",
            )

    return True, "ok"


def _is_non_parallel_article(text: str) -> bool:
    """Reject bank-only or customs-only articles that do not quote the parallel market."""
    has_parallel_kw = any(
        kw in text
        for kw in ("السوق الموازي", "السوق الموازية", "السوق السوداء", "السوق الأسود", "الموازي")
    )
    is_bank_or_customs = any(
        kw in text
        for kw in ("من البنوك", "القنوات المصرفية", "لدى البنوك", "الدولار الجمركي")
    )
    return is_bank_or_customs and not has_parallel_kw


def parse_usd_sdg_from_text(
    text: str,
    baseline_rate: float | None = None,
    max_deviation_ratio: float = DEFAULT_MAX_DEVIATION_RATIO,
) -> float | None:
    """Extract parallel USD/SDG rate (averaging buy+sell when both are quoted)."""
    normalized = normalize_digits(text)
    if _is_non_parallel_article(normalized):
        return None

    num_pat = r"((?:\d{1,3}(?:,\d{3})+|\d{3,5})(?:\.\d{1,2})?)"

    # Priority 0: Explicit buy + sell pair near USD (compute midpoint average)
    pair_patterns = [
        rf"(?:الدولار(?:\s*الأمريكي|\s*الامريكي)?|USD)[^.\n]{{0,45}}?(?:الشراء|شراء)\s*[:=\-]?\s*{num_pat}[^.\n]{{0,30}}?(?:البيع|بيع)\s*[:=\-]?\s*{num_pat}",
        rf"(?:متوسط\s*بيع\s*الدولار|بيع\s*الدولار)(?:[^0-9]{{0,35}}?من\s*{num_pat}\s*(?:جنيه(?:اً)?)?\s*إلى\s*|[^0-9]{{0,25}}){num_pat}[^.\n]{{0,90}}?(?:متوسط\s*الشراء|الشراء|شراء)(?:[^0-9]{{0,35}}?من\s*{num_pat}\s*(?:جنيه(?:اً)?)?\s*إلى\s*|[^0-9]{{0,25}}){num_pat}",
        rf"(?:متوسط\s*شراء\s*الدولار|الشراء|شراء)(?:[^0-9]{{0,35}}?من\s*{num_pat}\s*(?:جنيه(?:اً)?)?\s*إلى\s*|[^0-9]{{0,25}}){num_pat}[^.\n]{{0,90}}?(?:متوسط\s*البيع|البيع|بيع)(?:[^0-9]{{0,35}}?من\s*{num_pat}\s*(?:جنيه(?:اً)?)?\s*إلى\s*|[^0-9]{{0,25}}){num_pat}",
    ]
    for idx, pattern in enumerate(pair_patterns):
        for match in re.finditer(pattern, normalized, flags=re.IGNORECASE):
            snippet = match.group(0)
            if "الجمركي" in snippet or "الرسوم الجمركية" in snippet:
                continue
            if idx == 0:
                r1 = _parse_number(match.group(1))
                r2 = _parse_number(match.group(2))
            else:
                # Groups 2 and 4 hold the current/latest price (skipping optional "من X إلى")
                r1 = _parse_number(match.group(2))
                r2 = _parse_number(match.group(4))
            s1, _ = is_sane_rate(r1, baseline_rate, max_deviation_ratio)
            s2, _ = is_sane_rate(r2, baseline_rate, max_deviation_ratio)
            if s1 and s2 and r1 is not None and r2 is not None:
                return round((r1 + r2) / 2.0, 2)

    # Priority 1: Single explicit sell / parallel-market USD phrases (avoid customs dollar)
    patterns = [
        rf"(?:بيع\s*(?:الدولار|USD)|الدولار[^.\n]{{0,40}}بيع)(?:[^0-9]{{0,35}}?من\s*\d[\d,.]*\s*(?:جنيه(?:اً)?)?\s*إلى\s*|[^0-9]{{0,25}}){num_pat}",
        rf"(?:السوق\s*الموازي[ة]?|السوق\s*الأسود|السوق\s*السوداء)[^.\n]{{0,60}}(?:سعر\s*الدولار|الدولار)[^0-9]{{0,35}}{num_pat}",
        rf"(?:سعر\s*الدولار(?:\s*الأمريكي|\s*الامريكي|\s*الموازي|\s*اليوم)?(?:\s*في\s*السودان)?(?:\s*في\s*السوق\s*الموازي[ة]?)?)[^0-9]{{0,45}}{num_pat}",
        rf"(?:الدولار\s*(?:الأمريكي|الامريكي|الموازي))[^0-9]{{0,35}}{num_pat}",
        rf"(?:USD\s*/\s*SDG|USD\s*to\s*SDG|parallel\s*USD)[^0-9]{{0,25}}{num_pat}",
        rf"{num_pat}\s*(?:جنيه(?:\s*سوداني|اً)?|ج\.س|SDG)[^.\n]{{0,35}}(?:للدولار|الدولار|USD)",
    ]

    for pattern in patterns:
        for match in re.finditer(pattern, normalized, flags=re.IGNORECASE):
            snippet = match.group(0)
            if "الجمركي" in snippet or "الرسوم الجمركية" in snippet:
                continue
            candidate = _parse_number(match.group(1))
            sane, _ = is_sane_rate(candidate, baseline_rate, max_deviation_ratio)
            if sane and candidate is not None:
                return candidate

    return None


def parse_usd_sdg_from_json(
    payload: Any,
    baseline_rate: float | None = None,
    max_deviation_ratio: float = DEFAULT_MAX_DEVIATION_RATIO,
    max_age_hours: int = DEFAULT_MAX_ARTICLE_AGE_HOURS,
) -> float | None:
    """Extract USD/SDG parallel rate from JSON API or recent WordPress REST posts."""
    if isinstance(payload, dict):
        if "content" in payload and isinstance(payload["content"], dict):
            post_date = payload.get("date_gmt") or payload.get("date")
            if not _is_recent_iso_or_rfc(
                str(post_date) if post_date else None, max_age_hours
            ):
                return None

            title_raw = (
                payload.get("title", {}).get("rendered", "")
                if isinstance(payload.get("title"), dict)
                else ""
            )
            content_raw = payload["content"].get("rendered", "")
            combined = strip_html(f"{title_raw}. {content_raw}")
            return parse_usd_sdg_from_text(
                combined,
                baseline_rate=baseline_rate,
                max_deviation_ratio=max_deviation_ratio,
            )

        for key in (
            "parallel_usd_sdg",
            "usd_sdg_rate",
            "usd_sdg",
            "sell",
            "buy",
            "rate",
            "price",
            "SDG",
        ):
            if key in payload:
                val = payload[key]
                if isinstance(val, (int, float)):
                    num = round(float(val), 2)
                    sane, _ = is_sane_rate(num, baseline_rate, max_deviation_ratio)
                    if sane:
                        return num
                elif isinstance(val, str):
                    parsed = _parse_number(normalize_digits(val))
                    sane, _ = is_sane_rate(parsed, baseline_rate, max_deviation_ratio)
                    if sane and parsed is not None:
                        return parsed

        for nested_key in ("data", "rates", "result", "currency"):
            if nested_key in payload:
                nested = parse_usd_sdg_from_json(
                    payload[nested_key],
                    baseline_rate=baseline_rate,
                    max_deviation_ratio=max_deviation_ratio,
                    max_age_hours=max_age_hours,
                )
                if nested is not None:
                    return nested
    elif isinstance(payload, list):
        # Average across multiple valid recent WordPress posts if present
        post_rates: list[float] = []
        for item in payload:
            nested = parse_usd_sdg_from_json(
                item,
                baseline_rate=baseline_rate,
                max_deviation_ratio=max_deviation_ratio,
                max_age_hours=max_age_hours,
            )
            if nested is not None:
                if isinstance(item, dict) and "content" in item:
                    post_rates.append(nested)
                else:
                    return nested
        if post_rates:
            return round(sum(post_rates) / len(post_rates), 2)
    return None


def parse_rss_feed(
    raw_xml: str,
    baseline_rate: float | None = None,
    max_deviation_ratio: float = DEFAULT_MAX_DEVIATION_RATIO,
    max_age_hours: int = DEFAULT_MAX_ARTICLE_AGE_HOURS,
) -> float | None:
    """Extract average USD/SDG rate from recent RSS <item> entries."""
    items = re.findall(r"<item>(.*?)</item>", raw_xml, flags=re.IGNORECASE | re.DOTALL)
    rates: list[float] = []
    for item in items[:6]:
        pub_match = re.search(
            r"<pubDate>(.*?)</pubDate>", item, flags=re.IGNORECASE | re.DOTALL
        )
        if pub_match and not _is_recent_iso_or_rfc(pub_match.group(1).strip(), max_age_hours):
            continue
        text = strip_html(item)
        rate = parse_usd_sdg_from_text(text, baseline_rate, max_deviation_ratio)
        if rate is not None:
            rates.append(rate)
    if rates:
        return round(sum(rates) / len(rates), 2)
    return None


def parse_telegram_web_preview(
    raw_html: str,
    baseline_rate: float | None = None,
    max_deviation_ratio: float = DEFAULT_MAX_DEVIATION_RATIO,
) -> float | None:
    """Parse latest post from a public Telegram t.me/s/<channel> page."""
    messages = re.findall(
        r'<div[^>]*class="[^"]*tgme_widget_message_text[^"]*"[^>]*>(.*?)</div>',
        raw_html,
        flags=re.IGNORECASE | re.DOTALL,
    )
    for raw_msg in reversed(messages):
        msg_text = strip_html(raw_msg)
        rate = parse_usd_sdg_from_text(msg_text, baseline_rate, max_deviation_ratio)
        if rate is not None:
            return rate
    return None


def _scrape_url(
    name: str,
    url: str,
    baseline_rate: float | None,
    max_deviation_ratio: float,
    session_get: Callable[..., requests.Response],
) -> tuple[float | None, str]:
    resp = session_get(url, headers=SCRAPER_HEADERS, timeout=12)
    resp.raise_for_status()

    content_type = resp.headers.get("Content-Type", "").lower()
    body = resp.text

    if "application/json" in content_type or body.lstrip().startswith(("{", "[")):
        try:
            candidate = parse_usd_sdg_from_json(
                resp.json(),
                baseline_rate=baseline_rate,
                max_deviation_ratio=max_deviation_ratio,
            )
            sane, reason = is_sane_rate(candidate, baseline_rate, max_deviation_ratio)
            if sane and candidate is not None:
                return candidate, "ok"
            return None, reason
        except ValueError:
            pass

    if "xml" in content_type or "<rss" in body[:400].lower():
        candidate = parse_rss_feed(body, baseline_rate, max_deviation_ratio)
        if candidate is not None:
            return candidate, "ok"
        return None, "no recent USD/SDG item in RSS feed"

    if "t.me/s/" in url:
        candidate = parse_telegram_web_preview(body, baseline_rate, max_deviation_ratio)
        if candidate is not None:
            return candidate, "ok"

    plain_text = strip_html(body)
    candidate = parse_usd_sdg_from_text(plain_text, baseline_rate, max_deviation_ratio)
    if candidate is not None:
        return candidate, "ok"

    return None, "no recent valid USD/SDG rate matched or failed +/-25% sanity bounds"


def aggregate_rate_samples(samples: list[RateSample]) -> list[RateSample]:
    """Filter inter-source outliers beyond +/-15% from median when >= 3 samples exist."""
    if len(samples) < 3:
        return samples
    med = median(s.rate for s in samples)
    filtered = [
        s
        for s in samples
        if med > 0 and abs(s.rate - med) / med <= INTER_SOURCE_SPREAD_RATIO
    ]
    return filtered or samples


def _build_source_list(source_url: str | None) -> list[tuple[str, str]]:
    sources: list[tuple[str, str]] = []

    raw_urls = os.getenv("USD_SOURCE_URLS", "").strip()
    if raw_urls:
        for idx, item in enumerate(raw_urls.split(","), start=1):
            cleaned = item.strip()
            if cleaned:
                sources.append((f"env:USD_SOURCE_{idx}", cleaned))

    single_url = (source_url or os.getenv("USD_SOURCE_URL", "")).strip()
    if single_url and all(existing != single_url for _, existing in sources):
        sources.append(("env:USD_SOURCE_URL", single_url))

    sources.extend(DEFAULT_PUBLIC_SOURCES)
    return sources


def fetch_parallel_usd_sdg(
    baseline_rate: float,
    source_url: str | None = None,
    max_deviation_ratio: float | None = None,
    session_get: Callable[..., requests.Response] = requests.get,
) -> ParallelRateResult:
    """Query ALL specialized Sudan FX sources, filter outliers, and return their average."""
    deviation_limit = (
        max_deviation_ratio
        if max_deviation_ratio is not None
        else float(os.getenv("USD_MAX_DEVIATION_PCT", str(DEFAULT_MAX_DEVIATION_RATIO)))
    )

    sources = _build_source_list(source_url)
    samples: list[RateSample] = []
    failures: list[str] = []

    def _run_one(item: tuple[str, str]) -> tuple[str, float | None, str]:
        name, url = item
        try:
            rate, reason = _scrape_url(
                name=name,
                url=url,
                baseline_rate=baseline_rate,
                max_deviation_ratio=deviation_limit,
                session_get=session_get,
            )
            return name, rate, reason
        except Exception as exc:  # noqa: BLE001
            return name, None, str(exc)

    with ThreadPoolExecutor(max_workers=min(len(sources), 6)) as pool:
        for name, rate, reason in pool.map(_run_one, sources):
            if rate is not None:
                samples.append(RateSample(source=name, rate=rate))
            else:
                failures.append(f"{name}: {reason}")

    if samples:
        clean_samples = aggregate_rate_samples(samples)
        avg_rate = round(sum(s.rate for s in clean_samples) / len(clean_samples), 2)
        summary = ", ".join(f"{s.source}={s.rate:,.0f}" for s in clean_samples)
        source_tag = (
            clean_samples[0].source
            if len(clean_samples) == 1
            else f"avg({len(clean_samples)}):{'+'.join(s.source.split(':')[0] for s in clean_samples)}"
        )
        return ParallelRateResult(
            rate=avg_rate,
            source=source_tag,
            updated=True,
            note=f"متوسط تلقائي من {len(clean_samples)} مصدر ({summary})",
            samples=clean_samples,
        )

    print(
        "[warn] Parallel USD/SDG scraping failed or rejected as outlier across all sources; "
        f"retaining last valid Supabase rate {baseline_rate}. Details: "
        + " | ".join(failures)
    )
    return ParallelRateResult(
        rate=round(baseline_rate, 2),
        source="supabase:retained_last_valid",
        updated=False,
        note="الاحتفاظ بآخر سعر دولار موازي مسجل في قاعدة البيانات بعد تعذر المصادر الخارجية",
        samples=[],
    )

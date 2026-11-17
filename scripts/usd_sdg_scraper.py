"""Fault-tolerant scraper for Sudan parallel market USD/SDG exchange rates."""

from __future__ import annotations

import html
import math
import os
import re
from dataclasses import dataclass
from typing import Any, Callable

import requests

MIN_VALID_SDG = 500.0
MAX_VALID_SDG = 50000.0
DEFAULT_MAX_DEVIATION_RATIO = 0.25  # +/- 25% guardrail against database rate

SCRAPER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (compatible; SudanGoldExchangeBot/1.0; "
        "+https://sudan-gold-exchange.vercel.app)"
    ),
    "Accept": "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
    "Accept-Language": "ar,en;q=0.8",
}

ARABIC_DIGITS_MAP = str.maketrans("٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹", "01234567890123456789")

DEFAULT_PUBLIC_SOURCES: list[tuple[str, str]] = [
    (
        "sudanakhbar:wp-json",
        "https://www.sudanakhbar.com/wp-json/wp/v2/posts?search=%D8%B3%D8%B9%D8%B1+%D8%A7%D9%84%D8%AF%D9%88%D9%84%D8%A7%D8%B1+%D8%A7%D9%84%D8%B3%D9%88%D9%82+%D8%A7%D9%84%D9%85%D9%88%D8%A7%D8%B2%D9%8A&per_page=5",
    ),
    (
        "sudanakhbar:dollar-tag",
        "https://www.sudanakhbar.com/tag/%d8%b3%d8%b9%d8%b1-%d8%a7%d9%84%d8%af%d9%88%d9%84%d8%a7%d8%b1-%d9%81%d9%8a-%d8%a7%d9%84%d8%b3%d9%88%d8%af%d8%a7%d9%86",
    ),
    (
        "alsoug:currency",
        "https://www.alsoug.com/currency",
    ),
    (
        "altaghyeer:currencies",
        "https://www.altaghyeer.info/ar/tag/%d8%a3%d8%b3%d8%b9%d8%a7%d8%b1-%d8%a7%d9%84%d8%b9%d9%85%d9%84%d8%a7%d8%aa/",
    ),
]


@dataclass(frozen=True)
class ParallelRateResult:
    rate: float
    source: str
    updated: bool
    note: str


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


def parse_usd_sdg_from_json(
    payload: Any,
    baseline_rate: float | None = None,
    max_deviation_ratio: float = DEFAULT_MAX_DEVIATION_RATIO,
) -> float | None:
    """Extract USD/SDG parallel rate from common JSON or WordPress REST API payloads."""
    if isinstance(payload, dict):
        # WordPress post object: prioritize parallel-market sentences inside rendered content
        if "content" in payload and isinstance(payload["content"], dict):
            title_raw = (
                payload.get("title", {}).get("rendered", "")
                if isinstance(payload.get("title"), dict)
                else ""
            )
            content_raw = payload["content"].get("rendered", "")
            combined = strip_html(f"{title_raw}. {content_raw}")
            extracted = parse_usd_sdg_from_text(
                combined, baseline_rate=baseline_rate, max_deviation_ratio=max_deviation_ratio
            )
            if extracted is not None:
                return extracted

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
                )
                if nested is not None:
                    return nested
    elif isinstance(payload, list):
        for item in payload:
            nested = parse_usd_sdg_from_json(
                item,
                baseline_rate=baseline_rate,
                max_deviation_ratio=max_deviation_ratio,
            )
            if nested is not None:
                return nested
    return None


def parse_usd_sdg_from_text(
    text: str,
    baseline_rate: float | None = None,
    max_deviation_ratio: float = DEFAULT_MAX_DEVIATION_RATIO,
) -> float | None:
    """Extract a sane USD/SDG parallel rate from Arabic or English market text."""
    normalized = normalize_digits(text)
    num_pat = r"((?:\d{1,3}(?:,\d{3})+|\d{3,5})(?:\.\d{1,2})?)"

    # Priority 1: Explicit sell / parallel-market USD phrases (avoid customs dollar)
    patterns = [
        rf"(?:بيع\s*(?:الدولار|USD)|الدولار[^.\n]{{0,40}}بيع)[^0-9]{{0,25}}{num_pat}",
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


def parse_telegram_web_preview(
    raw_html: str,
    baseline_rate: float | None = None,
    max_deviation_ratio: float = DEFAULT_MAX_DEVIATION_RATIO,
) -> float | None:
    """Parse latest posts from a public Telegram t.me/s/<channel> page."""
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
    resp = session_get(url, headers=SCRAPER_HEADERS, timeout=10)
    resp.raise_for_status()

    content_type = resp.headers.get("Content-Type", "").lower()
    if "application/json" in content_type or resp.text.lstrip().startswith(("{", "[")):
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

    body = resp.text
    if "t.me/s/" in url:
        candidate = parse_telegram_web_preview(body, baseline_rate, max_deviation_ratio)
        if candidate is not None:
            return candidate, "ok"

    plain_text = strip_html(body)
    candidate = parse_usd_sdg_from_text(plain_text, baseline_rate, max_deviation_ratio)
    if candidate is not None:
        return candidate, "ok"

    return None, "no valid USD/SDG rate matched or failed +/-25% sanity bounds"


def fetch_parallel_usd_sdg(
    baseline_rate: float,
    source_url: str | None = None,
    max_deviation_ratio: float | None = None,
    session_get: Callable[..., requests.Response] = requests.get,
) -> ParallelRateResult:
    """Fetch Sudan parallel market USD/SDG rate with +/-25% sanity guardrails and fallback."""
    deviation_limit = (
        max_deviation_ratio
        if max_deviation_ratio is not None
        else float(os.getenv("USD_MAX_DEVIATION_PCT", str(DEFAULT_MAX_DEVIATION_RATIO)))
    )

    configured_url = (source_url or os.getenv("USD_SOURCE_URL", "")).strip()
    sources: list[tuple[str, str]] = []
    if configured_url:
        sources.append(("env:USD_SOURCE_URL", configured_url))
    sources.extend(DEFAULT_PUBLIC_SOURCES)

    failures: list[str] = []
    for name, url in sources:
        try:
            rate, reason = _scrape_url(
                name=name,
                url=url,
                baseline_rate=baseline_rate,
                max_deviation_ratio=deviation_limit,
                session_get=session_get,
            )
            if rate is not None:
                return ParallelRateResult(
                    rate=rate,
                    source=name,
                    updated=True,
                    note=f"تم تحديث سعر الدولار الموازي آلياً من {name}",
                )
            failures.append(f"{name}: {reason}")
        except Exception as exc:  # noqa: BLE001
            failures.append(f"{name}: {exc}")

    print(
        "[warn] Parallel USD/SDG scraping failed or rejected as outlier; "
        f"retaining last valid Supabase rate {baseline_rate}. Details: "
        + " | ".join(failures)
    )
    return ParallelRateResult(
        rate=round(baseline_rate, 2),
        source="supabase:retained_last_valid",
        updated=False,
        note="الاحتفاظ بآخر سعر دولار موازي مسجل في قاعدة البيانات بعد تعذر المصادر الخارجية",
    )

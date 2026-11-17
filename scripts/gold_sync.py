"""Daily automated XAU/USD -> SDG gold price sync and Telegram broadcaster."""

from __future__ import annotations

import argparse
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

import requests

# Support running as `python scripts/gold_sync.py` from repo root or `python gold_sync.py` from scripts/
_SCRIPT_DIR = str(Path(__file__).resolve().parent)
if _SCRIPT_DIR not in sys.path:
    sys.path.insert(0, _SCRIPT_DIR)

from usd_sdg_scraper import (  # noqa: E402
    MAX_VALID_SDG,
    MIN_VALID_SDG,
    ParallelRateResult,
    fetch_parallel_usd_sdg,
)

TROY_OUNCE_GRAMS = 31.1035
NISAB_24K_GRAMS = 85
DEFAULT_SITE_URL = "https://sudan-gold-exchange.vercel.app"
KHARTOUM_TZ = ZoneInfo("Africa/Khartoum")

HEADERS = {
    "User-Agent": "SudanGoldExchangeBot/1.0 (+https://sudan-gold-exchange.vercel.app)",
    "Accept": "application/json",
}


def load_local_env() -> None:
    """Load key=value pairs from .env / .env.local if not already in os.environ."""
    repo_root = Path(__file__).resolve().parent.parent
    for filename in (".env", ".env.local"):
        env_path = repo_root / filename
        if not env_path.is_file():
            continue
        for raw_line in env_path.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = value


def _fetch_from_gold_api() -> tuple[float, str] | None:
    resp = requests.get(
        "https://api.gold-api.com/price/XAU",
        headers=HEADERS,
        timeout=10,
    )
    resp.raise_for_status()
    price = float(resp.json()["price"])
    if price > 1000:
        return round(price, 2), "gold-api"
    return None


def _fetch_from_metals_live() -> tuple[float, str] | None:
    resp = requests.get(
        "https://api.metals.live/v1/spot/gold",
        headers=HEADERS,
        timeout=10,
    )
    resp.raise_for_status()
    payload = resp.json()
    first = payload[0] if isinstance(payload, list) and payload else None
    price = float(first["price"] if isinstance(first, dict) else first)
    if price > 1000:
        return round(price, 2), "metals.live"
    return None


def _fetch_from_yahoo(symbol: str) -> tuple[float, str] | None:
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?interval=1d&range=5d"
    resp = requests.get(url, headers=HEADERS, timeout=10)
    resp.raise_for_status()
    data = resp.json()
    meta = data["chart"]["result"][0]["meta"]
    price = float(meta["regularMarketPrice"])
    if price > 1000:
        return round(price, 2), f"yahoo:{symbol}"
    return None


def fetch_spot_gold_usd() -> tuple[float, str]:
    """Fetch XAU/USD spot price from multiple free fallback providers."""
    providers = [
        ("gold-api", _fetch_from_gold_api),
        ("metals.live", _fetch_from_metals_live),
        ("yahoo:GC=F", lambda: _fetch_from_yahoo("GC=F")),
        ("yahoo:XAUUSD=X", lambda: _fetch_from_yahoo("XAUUSD=X")),
    ]

    errors: list[str] = []
    for name, fn in providers:
        try:
            result = fn()
            if result is not None:
                return result
        except Exception as exc:  # noqa: BLE001
            errors.append(f"{name}: {exc}")

    raise RuntimeError(
        "Failed to fetch XAU/USD from all fallback sources: " + " | ".join(errors)
    )


def _supabase_headers(service_key: str) -> dict[str, str]:
    return {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json",
    }


def fetch_latest_rates_and_previous(
    supabase_url: str,
    service_key: str,
) -> tuple[float, float, float, float | None]:
    """Read latest USD/SDG rates, craftsmanship, and previous karat_24_sdg from Supabase."""
    default_parallel = float(os.getenv("DEFAULT_PARALLEL_USD_SDG", "2700"))
    default_official = float(os.getenv("DEFAULT_OFFICIAL_USD_SDG", "2020"))
    default_craft = float(os.getenv("DEFAULT_CRAFTSMANSHIP_SDG", "15000"))

    headers = _supabase_headers(service_key)
    base_rest = supabase_url.rstrip("/") + "/rest/v1"

    parallel_usd_sdg = default_parallel
    official_usd_sdg = default_official
    craftsmanship_sdg = default_craft
    prev_karat_24: float | None = None

    try:
        fx_resp = requests.get(
            f"{base_rest}/exchange_rates?select=parallel_usd_sdg,official_usd_sdg,craftsmanship_sdg&order=recorded_at.desc&limit=10",
            headers=headers,
            timeout=10,
        )
        if fx_resp.ok and fx_resp.json():
            rows = fx_resp.json()
            valid_fx = next(
                (
                    r
                    for r in rows
                    if MIN_VALID_SDG <= float(r.get("parallel_usd_sdg") or 0) <= MAX_VALID_SDG
                ),
                None,
            )
            if valid_fx:
                parallel_usd_sdg = float(valid_fx["parallel_usd_sdg"])
                official_usd_sdg = float(valid_fx.get("official_usd_sdg") or default_official)
                craftsmanship_sdg = float(valid_fx.get("craftsmanship_sdg") or default_craft)
            else:
                print("[warn] No sane parallel_usd_sdg found in exchange_rates; using default.")
    except Exception as exc:  # noqa: BLE001
        print(f"[warn] Could not read exchange_rates, using defaults: {exc}")

    try:
        gold_resp = requests.get(
            f"{base_rest}/gold_prices?select=karat_24_sdg,parallel_usd_sdg,official_usd_sdg,craftsmanship_sdg&order=recorded_at.desc&limit=10",
            headers=headers,
            timeout=10,
        )
        if gold_resp.ok and gold_resp.json():
            rows = gold_resp.json()
            valid_gold = next(
                (
                    r
                    for r in rows
                    if MIN_VALID_SDG <= float(r.get("parallel_usd_sdg") or 0) <= MAX_VALID_SDG
                ),
                rows[0],
            )
            prev_karat_24 = float(valid_gold["karat_24_sdg"])
            if (
                parallel_usd_sdg == default_parallel
                and valid_gold.get("parallel_usd_sdg")
                and MIN_VALID_SDG <= float(valid_gold["parallel_usd_sdg"]) <= MAX_VALID_SDG
            ):
                parallel_usd_sdg = float(valid_gold["parallel_usd_sdg"])
            if official_usd_sdg == default_official and valid_gold.get("official_usd_sdg"):
                official_usd_sdg = float(valid_gold["official_usd_sdg"])
            if craftsmanship_sdg == default_craft and valid_gold.get("craftsmanship_sdg") is not None:
                craftsmanship_sdg = float(valid_gold["craftsmanship_sdg"])
    except Exception as exc:  # noqa: BLE001
        print(f"[warn] Could not read previous gold_prices: {exc}")

    return parallel_usd_sdg, official_usd_sdg, craftsmanship_sdg, prev_karat_24


def calculate_gold_record(
    ounce_usd: float,
    parallel_usd_sdg: float,
    official_usd_sdg: float,
    craftsmanship_sdg: float,
    prev_karat_24: float | None,
    provider: str,
    fx_result: ParallelRateResult,
) -> dict[str, Any]:
    """Compute all gold karats mathematically from XAU/USD and USD/SDG."""
    karat_24 = (ounce_usd / TROY_OUNCE_GRAMS) * parallel_usd_sdg
    karat_22 = karat_24 * 0.9167
    karat_21 = karat_24 * 0.875
    karat_18 = karat_24 * 0.75
    gold_pound = karat_21 * 8

    change_pct = 0.0
    if prev_karat_24 and prev_karat_24 > 0:
        change_pct = round(((karat_24 - prev_karat_24) / prev_karat_24) * 100, 2)

    return {
        "recorded_at": datetime.now(timezone.utc).isoformat(),
        "ounce_usd": round(ounce_usd, 2),
        "parallel_usd_sdg": round(parallel_usd_sdg, 2),
        "official_usd_sdg": round(official_usd_sdg, 2),
        "karat_24_sdg": round(karat_24, 2),
        "karat_22_sdg": round(karat_22, 2),
        "karat_21_sdg": round(karat_21, 2),
        "karat_18_sdg": round(karat_18, 2),
        "gold_pound_sdg": round(gold_pound, 2),
        "craftsmanship_sdg": round(craftsmanship_sdg, 2),
        "change_pct": change_pct,
        "source": f"auto_sync:{provider}|fx:{fx_result.source}",
        "notes": fx_result.note,
    }


def save_exchange_rate_record(
    supabase_url: str,
    service_key: str,
    fx_result: ParallelRateResult,
    official_usd_sdg: float,
    craftsmanship_sdg: float,
    recorded_at: str,
) -> None:
    """Persist freshly scraped parallel USD/SDG exchange rate in Supabase."""
    base_rest = supabase_url.rstrip("/") + "/rest/v1"
    headers = {
        **_supabase_headers(service_key),
        "Prefer": "return=minimal",
    }
    payload = {
        "recorded_at": recorded_at,
        "parallel_usd_sdg": round(fx_result.rate, 2),
        "official_usd_sdg": round(official_usd_sdg, 2),
        "craftsmanship_sdg": round(craftsmanship_sdg, 2),
        "source": f"auto_scraper:{fx_result.source}",
        "notes": fx_result.note,
    }
    resp = requests.post(
        f"{base_rest}/exchange_rates",
        headers=headers,
        json=payload,
        timeout=15,
    )
    if not resp.ok:
        print(
            f"[warn] Could not insert exchange_rates row ({resp.status_code}): {resp.text}"
        )


def save_gold_record(
    supabase_url: str,
    service_key: str,
    record: dict[str, Any],
) -> None:
    """Insert computed gold price record into Supabase gold_prices table."""
    base_rest = supabase_url.rstrip("/") + "/rest/v1"
    headers = {
        **_supabase_headers(service_key),
        "Prefer": "return=representation",
    }
    resp = requests.post(
        f"{base_rest}/gold_prices",
        headers=headers,
        json=record,
        timeout=15,
    )
    if not resp.ok:
        raise RuntimeError(f"Supabase insert failed ({resp.status_code}): {resp.text}")


def format_sdg(value: float) -> str:
    return f"{round(value):,}"


def format_telegram_message(
    record: dict[str, Any],
    site_url: str,
    fx_result: ParallelRateResult | None = None,
) -> str:
    """Build formatted Arabic Telegram bulletin."""
    now_sd = datetime.now(KHARTOUM_TZ).strftime("%Y-%m-%d | %I:%M %p")
    change_pct = float(record["change_pct"])
    arrow = "📈" if change_pct > 0 else ("📉" if change_pct < 0 else "➖")
    sign = "+" if change_pct > 0 else ""
    nisab_sdg = float(record["karat_24_sdg"]) * NISAB_24K_GRAMS
    fx_source_label = fx_result.source if fx_result else str(record.get("source", "auto_sync"))

    lines = [
        "🪙 *نشرة أسعار الذهب في السودان — التحديث الدوري*",
        f"🕒 {now_sd} (توقيت السودان)",
        "",
        f"🌍 *الأونصة العالمية:* ${record['ounce_usd']:,.2f}",
        f"💵 *الدولار الموازي المعتمد:* {format_sdg(record['parallel_usd_sdg'])} ج.س",
        f"🏦 *الدولار الرسمي:* {format_sdg(record['official_usd_sdg'])} ج.س",
        f"📡 *مصدر التحديث:* `{fx_source_label}`",
        "",
        "📊 *أسعار الجرام في السوق السوداني (بالدولار الموازي):*",
        f"• *عيار 24:* {format_sdg(record['karat_24_sdg'])} ج.س",
        f"• *عيار 22:* {format_sdg(record['karat_22_sdg'])} ج.س",
        f"• *عيار 21 (الأكثر طلباً):* {format_sdg(record['karat_21_sdg'])} ج.س",
        f"• *عيار 18:* {format_sdg(record['karat_18_sdg'])} ج.س",
        f"• *الجنيه الذهب (8 جرام عيار 21):* {format_sdg(record['gold_pound_sdg'])} ج.س",
    ]

    if float(record.get("craftsmanship_sdg", 0)) > 0:
        lines.append(
            f"🔨 *متوسط مصنعية الصاغة:* {format_sdg(record['craftsmanship_sdg'])} ج.س / جرام"
        )

    lines.extend(
        [
            f"{arrow} *التغير عن القراءة السابقة:* {sign}{change_pct:.2f}%",
            f"🕌 *نصاب زكاة الذهب (85 جم عيار 24):* {format_sdg(nisab_sdg)} ج.س",
            "",
            "🔗 حاسبة الذهب والمصنعية والزكاة والأسعار المباشرة:",
            site_url,
        ]
    )
    return "\n".join(lines)


def send_telegram_bulletin(
    record: dict[str, Any],
    fx_result: ParallelRateResult | None = None,
) -> None:
    """Broadcast Arabic bulletin to Telegram channel inside try/except."""
    bot_token = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
    channel_id = os.getenv("TELEGRAM_CHANNEL_ID", "").strip()
    site_url = os.getenv("SITE_URL", DEFAULT_SITE_URL).strip() or DEFAULT_SITE_URL

    if not bot_token or not channel_id:
        print("[warn] TELEGRAM_BOT_TOKEN or TELEGRAM_CHANNEL_ID missing; skipping Telegram broadcast.")
        return

    message = format_telegram_message(record, site_url, fx_result=fx_result)
    try:
        resp = requests.post(
            f"https://api.telegram.org/bot{bot_token}/sendMessage",
            json={
                "chat_id": channel_id,
                "text": message,
                "parse_mode": "Markdown",
                "disable_web_page_preview": False,
            },
            timeout=12,
        )
        if not resp.ok:
            print(f"[warn] Telegram API returned {resp.status_code}: {resp.text}")
        else:
            print(f"[ok] Telegram bulletin sent to {channel_id}.")
    except Exception as exc:  # noqa: BLE001
        print(f"[warn] Telegram broadcast failed safely inside try/except: {exc}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Sync Sudan gold prices and notify Telegram.")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Compute prices without writing to Supabase or sending Telegram messages.",
    )
    args = parser.parse_args()

    load_local_env()

    supabase_url = (
        os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL") or ""
    ).strip()
    service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()

    ounce_usd, provider = fetch_spot_gold_usd()
    print(f"[ok] Fetched spot gold XAU/USD = ${ounce_usd:,.2f} via {provider}")

    if supabase_url and service_key:
        db_parallel_usd, official_usd, craft_sdg, prev_k24 = fetch_latest_rates_and_previous(
            supabase_url, service_key
        )
    else:
        db_parallel_usd = float(os.getenv("DEFAULT_PARALLEL_USD_SDG", "2700"))
        official_usd = float(os.getenv("DEFAULT_OFFICIAL_USD_SDG", "2020"))
        craft_sdg = float(os.getenv("DEFAULT_CRAFTSMANSHIP_SDG", "15000"))
        prev_k24 = None
        print("[warn] Supabase env missing; using default FX rates.")

    fx_result = fetch_parallel_usd_sdg(baseline_rate=db_parallel_usd)
    parallel_usd = fx_result.rate
    print(
        f"[info] Active parallel USD/SDG = {parallel_usd:,.2f} "
        f"(updated={fx_result.updated}, source={fx_result.source})"
    )

    record = calculate_gold_record(
        ounce_usd=ounce_usd,
        parallel_usd_sdg=parallel_usd,
        official_usd_sdg=official_usd,
        craftsmanship_sdg=craft_sdg,
        prev_karat_24=prev_k24,
        provider=provider,
        fx_result=fx_result,
    )

    print(
        "[info] Computed SDG prices -> "
        f"24K: {record['karat_24_sdg']}, "
        f"22K: {record['karat_22_sdg']}, "
        f"21K: {record['karat_21_sdg']}, "
        f"18K: {record['karat_18_sdg']}, "
        f"Pound: {record['gold_pound_sdg']}"
    )

    if args.dry_run:
        print("[dry-run] Preview Telegram message:\n")
        print(format_telegram_message(record, DEFAULT_SITE_URL, fx_result=fx_result))
        return 0

    if not supabase_url or not service_key:
        print(
            "[error] SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for live sync.",
            file=sys.stderr,
        )
        return 1

    if fx_result.updated:
        save_exchange_rate_record(
            supabase_url=supabase_url,
            service_key=service_key,
            fx_result=fx_result,
            official_usd_sdg=official_usd,
            craftsmanship_sdg=craft_sdg,
            recorded_at=record["recorded_at"],
        )

    save_gold_record(supabase_url, service_key, record)
    print("[ok] Saved new gold_prices record to Supabase.")

    send_telegram_bulletin(record, fx_result=fx_result)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

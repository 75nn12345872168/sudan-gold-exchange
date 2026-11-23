"""Unit tests for Sudan multi-source parallel USD/SDG scraper and averager."""

from __future__ import annotations

import unittest
from datetime import datetime, timedelta, timezone
from typing import Any

from usd_sdg_scraper import (
    RateSample,
    aggregate_rate_samples,
    fetch_parallel_usd_sdg,
    is_sane_rate,
    parse_rss_feed,
    parse_telegram_web_preview,
    parse_usd_sdg_from_json,
    parse_usd_sdg_from_text,
)


class _DummyResponse:
    def __init__(
        self,
        text: str = "",
        json_data: Any = None,
        content_type: str = "text/html",
        status_code: int = 200,
    ) -> None:
        self.text = text
        self._json = json_data
        self.headers = {"Content-Type": content_type}
        self.status_code = status_code

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")

    def json(self) -> Any:
        if self._json is None:
            raise ValueError("Not JSON")
        return self._json


class TestUsdSdgScraper(unittest.TestCase):
    def test_parses_arabic_text_and_indic_digits(self) -> None:
        sample = "أسعار العملات اليوم: سجل سعر الدولار الأمريكي في السوق الموازي ١٢٬٢٤٠ جنيه سوداني."
        self.assertEqual(parse_usd_sdg_from_text(sample, baseline_rate=12000), 12240.0)

    def test_averages_buy_and_sell_when_both_present(self) -> None:
        sample = "استقر متوسط بيع الدولار عند 12,300 جنيه، بينما بلغ متوسط الشراء 12,000 جنيه."
        self.assertEqual(parse_usd_sdg_from_text(sample, baseline_rate=12000), 12150.0)

    def test_prefers_latest_price_in_from_to_comparison_and_skips_bank_only(self) -> None:
        comparison = (
            "ارتفع سعر بيع الدولار في السوق الموازي من 10,950 جنيهاً إلى 12,300 جنيه، "
            "كما صعد متوسط الشراء من 10,900 إلى 12,000 جنيه."
        )
        self.assertEqual(parse_usd_sdg_from_text(comparison, baseline_rate=12000), 12150.0)

        bank_only = "سعر الدولار من البنوك والقنوات المصرفية بين 2,035 و 9,250 جنيه للدولار."
        self.assertIsNone(parse_usd_sdg_from_text(bank_only, baseline_rate=12000))

    def test_parses_telegram_web_preview_newest_first(self) -> None:
        html_doc = """
        <div class="tgme_widget_message_text">سعر الدولار اليوم 11900 جنيه</div>
        <div class="tgme_widget_message_text">تحديث المساء: سعر الدولار الموازي 12,260 جنيه سوداني</div>
        """
        self.assertEqual(
            parse_telegram_web_preview(html_doc, baseline_rate=12000),
            12260.0,
        )

    def test_parses_json_payload(self) -> None:
        self.assertEqual(
            parse_usd_sdg_from_json(
                {"data": {"parallel_usd_sdg": "12,125.5"}},
                baseline_rate=12000,
            ),
            12125.5,
        )

    def test_skips_stale_wordpress_post_and_customs_dollar(self) -> None:
        recent_iso = datetime.now(timezone.utc).isoformat()
        stale_iso = (datetime.now(timezone.utc) - timedelta(days=10)).isoformat()
        wp_payload = [
            {
                "date_gmt": stale_iso,
                "title": {"rendered": "خبر قديم"},
                "content": {"rendered": "<p>سعر الدولار الموازي 10,500 جنيه.</p>"},
            },
            {
                "date_gmt": recent_iso,
                "title": {"rendered": "زيادة الدولار الجمركي"},
                "content": {
                    "rendered": (
                        "<p>رفعت الحكومة السعر التأشيري للدولار الجمركي إلى 6,539 جنيهاً. "
                        "وفي السوق الموازية، تجاوز سعر الدولار 12,200 جنيه.</p>"
                    )
                },
            },
        ]
        self.assertEqual(
            parse_usd_sdg_from_json(wp_payload, baseline_rate=12000.0),
            12200.0,
        )

    def test_skips_stale_rss_items(self) -> None:
        stale_rss = """<?xml version="1.0"?>
        <rss><channel><item>
          <title>أسعار العملات</title>
          <pubDate>Sun, 12 Oct 2025 17:31:16 +0000</pubDate>
          <description>سعر الدولار الموازي 3500 جنيه</description>
        </item></channel></rss>"""
        self.assertIsNone(parse_rss_feed(stale_rss, baseline_rate=12000))

    def test_rejects_outliers_beyond_25_percent(self) -> None:
        sane_low, _ = is_sane_rate(8500, baseline_rate=12000)
        sane_high, _ = is_sane_rate(15500, baseline_rate=12000)
        sane_ok, _ = is_sane_rate(12350, baseline_rate=12000)
        self.assertFalse(sane_low)
        self.assertFalse(sane_high)
        self.assertTrue(sane_ok)

    def test_aggregate_filters_inter_source_outlier(self) -> None:
        samples = [
            RateSample("src_a", 12100.0),
            RateSample("src_b", 12300.0),
            RateSample("src_outlier", 14900.0),
        ]
        cleaned = aggregate_rate_samples(samples)
        self.assertEqual([s.source for s in cleaned], ["src_a", "src_b"])

    def test_graceful_fallback_retains_baseline_on_failures(self) -> None:
        def failing_get(*args: Any, **kwargs: Any) -> _DummyResponse:
            raise TimeoutError("Simulated network timeout")

        result = fetch_parallel_usd_sdg(
            baseline_rate=12000.0,
            source_url="https://t.me/s/example_channel",
            session_get=failing_get,
        )
        self.assertFalse(result.updated)
        self.assertEqual(result.rate, 12000.0)
        self.assertEqual(result.source, "supabase:retained_last_valid")

    def test_averages_multiple_live_sources(self) -> None:
        recent_iso = datetime.now(timezone.utc).isoformat()

        def mock_get(url: str, *args: Any, **kwargs: Any) -> _DummyResponse:
            if "t.me/s/" in url:
                return _DummyResponse(
                    text='<div class="tgme_widget_message_text">سعر الدولار الموازي 12100 جنيه</div>'
                )
            if "sudanakhbar.com" in url:
                return _DummyResponse(
                    json_data=[
                        {
                            "date_gmt": recent_iso,
                            "title": {"rendered": "سعر الدولار"},
                            "content": {
                                "rendered": "متوسط بيع الدولار 12,300 جنيه ومتوسط الشراء 12,100 جنيه"
                            },
                        }
                    ],
                    content_type="application/json",
                )
            if "dabangasudan.org" in url:
                return _DummyResponse(
                    json_data=[
                        {
                            "date_gmt": recent_iso,
                            "title": {"rendered": "سوق النقد"},
                            "content": {"rendered": "سعر الدولار الموازي 12,300 جنيه"},
                        }
                    ],
                    content_type="application/json",
                )
            return _DummyResponse(status_code=404)

        result = fetch_parallel_usd_sdg(
            baseline_rate=12000.0,
            source_url="https://t.me/s/sudan_fx_feed",
            session_get=mock_get,
        )
        # Samples: t.me=12100, sudanakhbar=12200, dabanga=12300 -> average = 12200.0
        self.assertTrue(result.updated)
        self.assertEqual(result.rate, 12200.0)
        self.assertEqual(len(result.samples), 3)


if __name__ == "__main__":
    unittest.main()

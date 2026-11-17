"""Unit tests for Sudan parallel USD/SDG scraper and guardrails."""

from __future__ import annotations

import unittest
from typing import Any

from usd_sdg_scraper import (
    fetch_parallel_usd_sdg,
    is_sane_rate,
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
        sample = "أسعار العملات اليوم: سجل سعر الدولار الأمريكي في السوق الموازي ٢٬٧٤٠ جنيه سوداني."
        self.assertEqual(parse_usd_sdg_from_text(sample, baseline_rate=2700), 2740.0)

    def test_prefers_sell_rate_when_present(self) -> None:
        sample = "تداول الدولار شراء 2710 جنيه وبيع الدولار 2750 جنيه سوداني اليوم."
        self.assertEqual(parse_usd_sdg_from_text(sample, baseline_rate=2700), 2750.0)

    def test_parses_telegram_web_preview_newest_first(self) -> None:
        html_doc = """
        <div class="tgme_widget_message_text">سعر الدولار اليوم 2680 جنيه</div>
        <div class="tgme_widget_message_text">تحديث المساء: سعر الدولار الموازي 2,760 جنيه سوداني</div>
        """
        self.assertEqual(
            parse_telegram_web_preview(html_doc, baseline_rate=2700),
            2760.0,
        )

    def test_parses_json_payload(self) -> None:
        self.assertEqual(
            parse_usd_sdg_from_json({"data": {"parallel_usd_sdg": "2,725.5"}}),
            2725.5,
        )

    def test_parses_wordpress_post_and_skips_customs_dollar(self) -> None:
        wp_payload = [
            {
                "title": {"rendered": "زيادة الدولار الجمركي"},
                "content": {
                    "rendered": (
                        "<p>رفعت الحكومة السعر التأشيري للدولار الجمركي إلى 6,539 جنيهاً. "
                        "وفي السوق الموازية، تجاوز سعر الدولار 12,000 جنيه.</p>"
                    )
                },
            }
        ]
        self.assertEqual(
            parse_usd_sdg_from_json(wp_payload, baseline_rate=11900.0),
            12000.0,
        )

    def test_rejects_outliers_beyond_25_percent(self) -> None:
        sane_low, _ = is_sane_rate(1900, baseline_rate=2700)
        sane_high, _ = is_sane_rate(3600, baseline_rate=2700)
        sane_ok, _ = is_sane_rate(2850, baseline_rate=2700)
        self.assertFalse(sane_low)
        self.assertFalse(sane_high)
        self.assertTrue(sane_ok)

    def test_graceful_fallback_retains_baseline_on_failures(self) -> None:
        def failing_get(*args: Any, **kwargs: Any) -> _DummyResponse:
            raise TimeoutError("Simulated network timeout")

        result = fetch_parallel_usd_sdg(
            baseline_rate=2700.0,
            source_url="https://t.me/s/example_channel",
            session_get=failing_get,
        )
        self.assertFalse(result.updated)
        self.assertEqual(result.rate, 2700.0)
        self.assertEqual(result.source, "supabase:retained_last_valid")

    def test_uses_custom_usd_source_url_when_valid(self) -> None:
        def mock_get(url: str, *args: Any, **kwargs: Any) -> _DummyResponse:
            if "t.me/s/" in url:
                return _DummyResponse(
                    text='<div class="tgme_widget_message_text">سعر الدولار الموازي 2780 جنيه</div>'
                )
            return _DummyResponse(status_code=404)

        result = fetch_parallel_usd_sdg(
            baseline_rate=2700.0,
            source_url="https://t.me/s/sudan_fx_feed",
            session_get=mock_get,
        )
        self.assertTrue(result.updated)
        self.assertEqual(result.rate, 2780.0)
        self.assertEqual(result.source, "env:USD_SOURCE_URL")


if __name__ == "__main__":
    unittest.main()

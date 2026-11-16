import Link from "next/link";
import { Calculator, BarChart3, Send, ShieldCheck } from "lucide-react";
import { GoldCalculator } from "@/components/GoldCalculator";
import {
  GOLD_FAQS,
  MarketFaqAndMethodology,
} from "@/components/MarketFaqAndMethodology";
import { PriceCardsGrid } from "@/components/PriceCardsGrid";
import { PriceHistoryChart } from "@/components/PriceHistoryChart";
import { TopTickerBar } from "@/components/TopTickerBar";
import { getDashboardData } from "@/lib/gold-service";
import { formatSdg, formatUsd } from "@/lib/gold-math";
import { getSiteUrl, getTelegramChannelUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const data = await getDashboardData();
  const { latest, history, isFallback, dataSourceLabel } = data;
  const siteUrl = getSiteUrl();
  const telegramUrl = getTelegramChannelUrl();

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${siteUrl}/#website`,
        url: siteUrl,
        name: "منصة أسعار الذهب في السودان | Sudan Gold Exchange",
        inLanguage: "ar-SD",
        description:
          "متابعة لحظية لأسعار الذهب في السودان بجميع العيارات (24 و22 و21 و18 والجنيه الذهب) وفق السوق الموازي والسعر الرسمي.",
      },
      {
        "@type": "Dataset",
        "@id": `${siteUrl}/#dataset`,
        name: "أسعار الذهب اليوم في السودان بالجنيه السوداني",
        description: `أسعار الذهب في السودان استناداً إلى سعر الأونصة العالمية ($${formatUsd(latest.ounce_usd)}) وسعر الدولار الموازي (${formatSdg(latest.parallel_usd_sdg)} ج.س).`,
        url: siteUrl,
        temporalCoverage: latest.recorded_at,
        creator: {
          "@type": "Organization",
          name: "Sudan Gold Exchange",
        },
        variableMeasured: [
          "سعر جرام الذهب عيار 24 بالجنيه السوداني",
          "سعر جرام الذهب عيار 21 بالجنيه السوداني",
          "سعر جرام الذهب عيار 18 بالجنيه السوداني",
          "سعر الجنيه الذهب في السودان",
        ],
      },
      {
        "@type": "FAQPage",
        mainEntity: GOLD_FAQS.map((item) => ({
          "@type": "Question",
          name: item.question,
          acceptedAnswer: {
            "@type": "Answer",
            text: item.answer,
          },
        })),
      },
    ],
  };

  return (
    <div className="min-h-screen bg-[#f8f7f4] text-slate-900">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <TopTickerBar latest={latest} isFallback={isFallback} />

      <main className="mx-auto max-w-7xl space-y-10 px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
        {/* Hero Overview */}
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-slate-900 to-[#241c09] p-6 text-white shadow-xl sm:p-10">
          <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-400/10 px-3.5 py-1 text-xs font-semibold text-amber-300">
                <span>{dataSourceLabel}</span>
              </div>
              <h1 className="text-2xl font-bold leading-snug text-white sm:text-4xl">
                أسعار الذهب في السودان لحظة بلحظة
              </h1>
              <p className="text-sm leading-relaxed text-slate-300 sm:text-base">
                مرصد يومي دقيق لأسعار الذهب في سوق الصاغة السوداني بجميع العيارات
                والجنيه الذهب، محسوب آلياً وفق حركة الأونصة العالمية وسعر الصرف
                الموازي والرسمي.
              </p>

              <div className="flex flex-wrap items-center gap-3 pt-2">
                <a
                  href="#calculator"
                  className="inline-flex items-center gap-2 rounded-xl bg-amber-400 px-4 py-2.5 text-sm font-bold text-slate-950 shadow-sm transition hover:bg-amber-300"
                >
                  <Calculator className="h-4 w-4" />
                  حاسبة الذهب والزكاة
                </a>
                <a
                  href="#history"
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-amber-400/40 hover:text-white"
                >
                  <BarChart3 className="h-4 w-4 text-amber-300" />
                  الرسم البياني (7 / 30 يوماً)
                </a>
                <a
                  href={telegramUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl border border-sky-400/40 bg-sky-500/15 px-4 py-2.5 text-sm font-semibold text-sky-200 transition hover:bg-sky-500/25"
                >
                  <Send className="h-4 w-4" />
                  اشترك في قناة تيليجرام
                </a>
              </div>
            </div>

            {/* Highlighted 21K + 24K Quick Box */}
            <div className="grid grid-cols-2 gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm sm:min-w-[330px]">
              <div className="rounded-xl bg-slate-950/70 p-4">
                <span className="block text-xs text-slate-400">
                  عيار 21 (السوق الموازي)
                </span>
                <span className="mt-1.5 block font-mono text-2xl font-bold text-amber-300 tabular-nums">
                  {formatSdg(latest.karat_21_sdg)}
                </span>
                <span className="text-[11px] text-slate-400">ج.س / جرام</span>
              </div>

              <div className="rounded-xl bg-slate-950/70 p-4">
                <span className="block text-xs text-slate-400">
                  الجنيه الذهب (8 جم)
                </span>
                <span className="mt-1.5 block font-mono text-2xl font-bold text-white tabular-nums">
                  {formatSdg(latest.gold_pound_sdg)}
                </span>
                <span className="text-[11px] text-slate-400">ج.س / قطعة</span>
              </div>
            </div>
          </div>
        </section>

        <PriceCardsGrid latest={latest} />

        <GoldCalculator latest={latest} />

        <PriceHistoryChart history={history} />

        <MarketFaqAndMethodology />
      </main>

      <footer className="mt-12 border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-8 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <div>
            <p className="font-bold text-slate-900">
              منصة أسعار الذهب في السودان (Sudan Gold Exchange)
            </p>
            <p className="mt-1 text-xs text-slate-500">
              الأسعار استرشادية وتُحدّث آلياً 3 مرات يومياً مع إمكانية التحديث
              الميداني الفوري.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <a
              href={telegramUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-xl bg-sky-500 px-3.5 py-2 text-xs font-semibold text-white hover:bg-sky-600"
            >
              <Send className="h-3.5 w-3.5" />
              قناة تيليجرام
            </a>
            <Link
              href="/admin/update"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <ShieldCheck className="h-3.5 w-3.5 text-amber-600" />
              لوحة الإدارة الميدانية
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

import { TrendingDown, TrendingUp, Minus, Sparkles } from "lucide-react";
import {
  calculateKaratsFromUsdSdg,
  formatChangePct,
  formatSdg,
  formatUsd,
} from "@/lib/gold-math";
import type { GoldPriceRecord } from "@/lib/types";

interface PriceCardsGridProps {
  latest: GoldPriceRecord;
}

interface GoldCardItem {
  id: string;
  title: string;
  subtitle: string;
  parallelPrice: number;
  officialPrice: number;
  usdHint?: string;
  featured?: boolean;
  badge?: string;
}

function ChangeBadge({ changePct }: { changePct: number }) {
  if (changePct > 0) {
    return (
      <span
        dir="ltr"
        className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 font-mono text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/20 tabular-nums"
      >
        <TrendingUp className="h-3.5 w-3.5" />
        {formatChangePct(changePct)}
      </span>
    );
  }

  if (changePct < 0) {
    return (
      <span
        dir="ltr"
        className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 font-mono text-xs font-semibold text-rose-700 ring-1 ring-inset ring-rose-600/20 tabular-nums"
      >
        <TrendingDown className="h-3.5 w-3.5" />
        {formatChangePct(changePct)}
      </span>
    );
  }

  return (
    <span
      dir="ltr"
      className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 font-mono text-xs font-semibold text-slate-600 ring-1 ring-inset ring-slate-300/60 tabular-nums"
    >
      <Minus className="h-3.5 w-3.5" />
      0.00%
    </span>
  );
}

export function PriceCardsGrid({ latest }: PriceCardsGridProps) {
  const officialKarats = calculateKaratsFromUsdSdg(
    latest.ounce_usd,
    latest.official_usd_sdg
  );

  const ounceParallelSdg = latest.ounce_usd * latest.parallel_usd_sdg;
  const ounceOfficialSdg = latest.ounce_usd * latest.official_usd_sdg;

  const cards: GoldCardItem[] = [
    {
      id: "karat-21",
      title: "ذهب عيار 21",
      subtitle: "سعر الجرام • العيار الأكثر تداولاً في الصاغة",
      parallelPrice: latest.karat_21_sdg,
      officialPrice: officialKarats.karat_21_sdg,
      usdHint: `$${formatUsd((latest.ounce_usd / 31.1035) * 0.875)} / جم`,
      featured: true,
      badge: "الأكثر طلباً",
    },
    {
      id: "karat-24",
      title: "ذهب عيار 24",
      subtitle: "سعر الجرام • الذهب الخالص والسبائك (999.9)",
      parallelPrice: latest.karat_24_sdg,
      officialPrice: officialKarats.karat_24_sdg,
      usdHint: `$${formatUsd(latest.ounce_usd / 31.1035)} / جم`,
    },
    {
      id: "karat-22",
      title: "ذهب عيار 22",
      subtitle: "سعر الجرام • ذهب المشغولات الخليجية (916.7)",
      parallelPrice: latest.karat_22_sdg,
      officialPrice: officialKarats.karat_22_sdg,
      usdHint: `$${formatUsd((latest.ounce_usd / 31.1035) * 0.9167)} / جم`,
    },
    {
      id: "karat-18",
      title: "ذهب عيار 18",
      subtitle: "سعر الجرام • المجوهرات والأطقم الحديثة (750)",
      parallelPrice: latest.karat_18_sdg,
      officialPrice: officialKarats.karat_18_sdg,
      usdHint: `$${formatUsd((latest.ounce_usd / 31.1035) * 0.75)} / جم`,
    },
    {
      id: "gold-pound",
      title: "الجنيه الذهب",
      subtitle: "وزن 8 جرام صافي من ذهب عيار 21",
      parallelPrice: latest.gold_pound_sdg,
      officialPrice: officialKarats.gold_pound_sdg,
      usdHint: `$${formatUsd((latest.ounce_usd / 31.1035) * 0.875 * 8)} / جنيه`,
    },
    {
      id: "ounce",
      title: "أونصة الذهب",
      subtitle: "وزن 31.1035 جرام من ذهب عيار 24",
      parallelPrice: ounceParallelSdg,
      officialPrice: ounceOfficialSdg,
      usdHint: `$${formatUsd(latest.ounce_usd)} عالمياً`,
    },
  ];

  return (
    <section id="prices" className="scroll-mt-24">
      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900 sm:text-2xl">
            أسعار الذهب اليوم في السودان (جميع العيارات)
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            يُعرض السعر الفعلي في السوق السوداني وفق الدولار الموازي (
            <span className="font-mono font-semibold text-slate-900">
              {formatSdg(latest.parallel_usd_sdg)} ج.س
            </span>
            ) ومقارنته بالسعر الرسمي المعادل (
            <span className="font-mono font-semibold text-slate-700">
              {formatSdg(latest.official_usd_sdg)} ج.س
            </span>
            ).
          </p>
        </div>

        {latest.craftsmanship_sdg > 0 && (
          <div className="inline-flex items-center gap-2 self-start rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2 text-xs font-medium text-amber-900 sm:self-auto">
            <span>متوسط مصنعية الصاغة:</span>
            <span className="font-mono font-bold tabular-nums">
              {formatSdg(latest.craftsmanship_sdg)} ج.س / جم
            </span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <article
            key={card.id}
            className={`relative flex flex-col justify-between rounded-2xl border p-5 transition-all hover:-translate-y-0.5 hover:shadow-lg ${
              card.featured
                ? "border-amber-400 bg-gradient-to-br from-amber-50/90 via-white to-amber-50/40 shadow-md shadow-amber-900/5 ring-1 ring-amber-400/40"
                : "border-slate-200/90 bg-white shadow-sm"
            }`}
          >
            <div>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-bold text-slate-900">
                      {card.title}
                    </h3>
                    {card.badge && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500 px-2.5 py-0.5 text-[11px] font-bold text-slate-950">
                        <Sparkles className="h-3 w-3" />
                        {card.badge}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{card.subtitle}</p>
                </div>
                <ChangeBadge changePct={latest.change_pct} />
              </div>

              <div className="mt-5 rounded-xl bg-slate-950 p-4 text-white">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>السعر الفعلي (السوق الموازي)</span>
                  {card.usdHint && (
                    <span dir="ltr" className="font-mono text-amber-300/90">
                      {card.usdHint}
                    </span>
                  )}
                </div>
                <div className="mt-1.5 flex items-baseline gap-2">
                  <span className="font-mono text-2xl font-bold tracking-tight text-amber-300 tabular-nums sm:text-3xl">
                    {formatSdg(card.parallelPrice)}
                  </span>
                  <span className="text-sm font-medium text-slate-300">
                    جنيه سوداني
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-3.5 py-2.5 text-xs">
              <span className="font-medium text-slate-600">
                السعر الرسمي المعادل
              </span>
              <span className="font-mono font-bold text-slate-800 tabular-nums">
                {formatSdg(card.officialPrice)} ج.س
              </span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

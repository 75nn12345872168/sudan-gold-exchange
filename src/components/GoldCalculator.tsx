"use client";

import { useMemo, useState } from "react";
import { Calculator, Scale, Sparkles, CheckCircle2, Info } from "lucide-react";
import {
  GOLD_POUND_GRAMS,
  KARAT_PURITY_FACTORS,
  NISAB_24K_GRAMS,
  TOLA_GRAMS,
  TROY_OUNCE_GRAMS,
  UNIT_TO_GRAMS,
  ZAKAT_RATE,
  calculateKaratsFromUsdSdg,
  formatSdg,
  formatUsd,
} from "@/lib/gold-math";
import type {
  GoldPriceRecord,
  KaratKey,
  PricingTier,
  WeightUnit,
} from "@/lib/types";

interface GoldCalculatorProps {
  latest: GoldPriceRecord;
}

const KARAT_OPTIONS: Array<{ key: KaratKey; label: string; sub: string }> = [
  { key: "21", label: "عيار 21", sub: "الأكثر شيوعاً" },
  { key: "24", label: "عيار 24", sub: "سبائك 999.9" },
  { key: "22", label: "عيار 22", sub: "خليجي 916.7" },
  { key: "18", label: "عيار 18", sub: "مشغولات 750" },
  { key: "pound", label: "الجنيه الذهب", sub: "8 جم عيار 21" },
];

const UNIT_OPTIONS: Array<{ key: WeightUnit; label: string; gramsHint: string }> = [
  { key: "gram", label: "جرام", gramsHint: "1 جم" },
  { key: "tola", label: "تولة", gramsHint: `${TOLA_GRAMS} جم` },
  { key: "ounce", label: "أونصة", gramsHint: `${TROY_OUNCE_GRAMS} جم` },
];

export function GoldCalculator({ latest }: GoldCalculatorProps) {
  const [selectedKarat, setSelectedKarat] = useState<KaratKey>("21");
  const [weightInput, setWeightInput] = useState<string>("10");
  const [unit, setUnit] = useState<WeightUnit>("gram");
  const [pricingTier, setPricingTier] = useState<PricingTier>("parallel");
  const [craftsmanshipInput, setCraftsmanshipInput] = useState<string>(
    String(Math.round(latest.craftsmanship_sdg || 0))
  );

  const officialKarats = useMemo(
    () => calculateKaratsFromUsdSdg(latest.ounce_usd, latest.official_usd_sdg),
    [latest.ounce_usd, latest.official_usd_sdg]
  );

  const calculation = useMemo(() => {
    const rawWeight = Math.max(0, Number(weightInput) || 0);
    const craftsmanshipPerGram = Math.max(0, Number(craftsmanshipInput) || 0);

    const usdRate =
      pricingTier === "parallel"
        ? latest.parallel_usd_sdg
        : latest.official_usd_sdg;

    const karat24Sdg =
      pricingTier === "parallel"
        ? latest.karat_24_sdg
        : officialKarats.karat_24_sdg;

    const priceMap: Record<KaratKey, number> =
      pricingTier === "parallel"
        ? {
            "24": latest.karat_24_sdg,
            "22": latest.karat_22_sdg,
            "21": latest.karat_21_sdg,
            "18": latest.karat_18_sdg,
            pound: latest.karat_21_sdg,
          }
        : {
            "24": officialKarats.karat_24_sdg,
            "22": officialKarats.karat_22_sdg,
            "21": officialKarats.karat_21_sdg,
            "18": officialKarats.karat_18_sdg,
            pound: officialKarats.karat_21_sdg,
          };

    // For gold_pound, the user enters number of pounds (each 8g of 21K)
    const totalGrams =
      selectedKarat === "pound"
        ? rawWeight * GOLD_POUND_GRAMS
        : rawWeight * UNIT_TO_GRAMS[unit];

    const purityFactor =
      selectedKarat === "pound"
        ? KARAT_PURITY_FACTORS["21"]
        : KARAT_PURITY_FACTORS[selectedKarat];

    const pure24kGrams = totalGrams * purityFactor;
    const perGramGoldSdg = priceMap[selectedKarat];
    const goldValueSdg = totalGrams * perGramGoldSdg;
    const totalCraftsmanshipSdg = totalGrams * craftsmanshipPerGram;
    const grandTotalSdg = goldValueSdg + totalCraftsmanshipSdg;
    const grandTotalUsd = usdRate > 0 ? grandTotalSdg / usdRate : 0;
    const goldOnlyUsd = usdRate > 0 ? goldValueSdg / usdRate : 0;

    // Zakat Nisab (85g of pure 24K gold)
    const nisabParallelSdg = latest.karat_24_sdg * NISAB_24K_GRAMS;
    const nisabOfficialSdg = officialKarats.karat_24_sdg * NISAB_24K_GRAMS;
    const nisabSelectedSdg = karat24Sdg * NISAB_24K_GRAMS;
    const nisabUsd =
      latest.parallel_usd_sdg > 0
        ? nisabParallelSdg / latest.parallel_usd_sdg
        : 0;

    const reachesNisab = pure24kGrams >= NISAB_24K_GRAMS;
    const nisabProgressPct = Math.min(
      100,
      Math.round((pure24kGrams / NISAB_24K_GRAMS) * 100)
    );
    const remaining24kGrams = Math.max(0, NISAB_24K_GRAMS - pure24kGrams);
    const zakatGrams24k = reachesNisab ? pure24kGrams * ZAKAT_RATE : 0;
    const zakatDueSdg = reachesNisab ? goldValueSdg * ZAKAT_RATE : 0;

    return {
      totalGrams,
      pure24kGrams,
      perGramGoldSdg,
      goldValueSdg,
      totalCraftsmanshipSdg,
      grandTotalSdg,
      grandTotalUsd,
      goldOnlyUsd,
      nisabParallelSdg,
      nisabOfficialSdg,
      nisabSelectedSdg,
      nisabUsd,
      reachesNisab,
      nisabProgressPct,
      remaining24kGrams,
      zakatGrams24k,
      zakatDueSdg,
    };
  }, [
    weightInput,
    craftsmanshipInput,
    pricingTier,
    selectedKarat,
    unit,
    latest,
    officialKarats,
  ]);

  return (
    <section
      id="calculator"
      className="scroll-mt-24 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8"
    >
      <div className="mb-6 flex flex-col gap-3 border-b border-slate-100 pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
            <Calculator className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-xl font-bold text-slate-900 sm:text-2xl">
              حاسبة الذهب والمصنعية والزكاة التفاعلية
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              احسب قيمة أي وزن بالجرام أو التولة أو الأونصة أو الجنيه الذهب مع
              المصنعية، وتحقق تلقائياً من بلوغ نصاب الزكاة.
            </p>
          </div>
        </div>

        <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
          <button
            type="button"
            onClick={() => setPricingTier("parallel")}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              pricingTier === "parallel"
                ? "bg-slate-950 text-amber-300 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            السوق الموازي (الفعلي)
          </button>
          <button
            type="button"
            onClick={() => setPricingTier("official")}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              pricingTier === "official"
                ? "bg-slate-950 text-amber-300 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            السعر الرسمي
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Input Controls */}
        <div className="space-y-5 lg:col-span-7">
          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-800">
              1. اختر العيار أو النوع
            </label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {KARAT_OPTIONS.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setSelectedKarat(option.key)}
                  className={`rounded-xl border p-3 text-right transition ${
                    selectedKarat === option.key
                      ? "border-amber-500 bg-amber-50/80 ring-1 ring-amber-500"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <div className="text-sm font-bold text-slate-900">
                    {option.label}
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-500">
                    {option.sub}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="gold-weight-input"
                className="mb-2 block text-sm font-semibold text-slate-800"
              >
                {selectedKarat === "pound"
                  ? "2. عدد الجنيهات الذهبية"
                  : "2. أدخل الوزن"}
              </label>
              <input
                id="gold-weight-input"
                type="number"
                min="0"
                step="0.01"
                value={weightInput}
                onChange={(e) => setWeightInput(e.target.value)}
                dir="ltr"
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-right font-mono text-lg font-bold text-slate-900 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                placeholder="10"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-800">
                وحدة القياس
              </label>
              {selectedKarat === "pound" ? (
                <div className="flex h-[52px] items-center justify-between rounded-xl border border-amber-200 bg-amber-50/60 px-4 text-sm font-medium text-amber-900">
                  <span>جنيه ذهب</span>
                  <span className="font-mono text-xs text-amber-700">
                    8 جم عيار 21 / قطعة
                  </span>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {UNIT_OPTIONS.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => setUnit(item.key)}
                      className={`flex flex-col items-center justify-center rounded-xl border py-2 text-center transition ${
                        unit === item.key
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      <span className="text-xs font-bold">{item.label}</span>
                      <span
                        className={`text-[10px] ${
                          unit === item.key ? "text-amber-300" : "text-slate-500"
                        }`}
                      >
                        {item.gramsHint}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <label
                htmlFor="craftsmanship-input"
                className="text-sm font-semibold text-slate-800"
              >
                3. المصنعية لكل جرام (جنيه سوداني)
              </label>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setCraftsmanshipInput("0")}
                  className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
                >
                  بدون مصنعية (كسر/سبائك)
                </button>
                {latest.craftsmanship_sdg > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      setCraftsmanshipInput(
                        String(Math.round(latest.craftsmanship_sdg))
                      )
                    }
                    className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100"
                  >
                    المعتمد ({formatSdg(latest.craftsmanship_sdg)})
                  </button>
                )}
              </div>
            </div>
            <input
              id="craftsmanship-input"
              type="number"
              min="0"
              step="500"
              value={craftsmanshipInput}
              onChange={(e) => setCraftsmanshipInput(e.target.value)}
              dir="ltr"
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-right font-mono text-base font-bold text-slate-900 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
              placeholder="15000"
            />
          </div>

          {/* Automatic Nisab Reference Card */}
          <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50/90 to-white p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-emerald-950">
                <Scale className="h-5 w-5 text-emerald-700" />
                <h3 className="text-sm font-bold sm:text-base">
                  نصاب زكاة الذهب الشرعي (85 جرام عيار 24)
                </h3>
              </div>
              <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                تحديث تلقائي
              </span>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-emerald-200/70 bg-white p-3">
                <span className="block text-xs text-slate-500">
                  قيمة النصاب (بالسوق الموازي)
                </span>
                <span className="mt-1 block font-mono text-lg font-bold text-emerald-900 tabular-nums">
                  {formatSdg(calculation.nisabParallelSdg)} ج.س
                </span>
                <span
                  dir="ltr"
                  className="font-mono text-xs text-slate-500 tabular-nums"
                >
                  ≈ ${formatUsd(calculation.nisabUsd)}
                </span>
              </div>

              <div className="rounded-xl border border-emerald-200/70 bg-white p-3">
                <span className="block text-xs text-slate-500">
                  قيمة النصاب (بالسعر الرسمي)
                </span>
                <span className="mt-1 block font-mono text-lg font-bold text-slate-800 tabular-nums">
                  {formatSdg(calculation.nisabOfficialSdg)} ج.س
                </span>
                <span className="text-[11px] text-slate-500">
                  الذهب الخالص المكافئ للوزن المدخل:{" "}
                  <strong className="font-mono text-slate-800">
                    {calculation.pure24kGrams.toFixed(2)} جم
                  </strong>
                </span>
              </div>
            </div>

            <div className="mt-3">
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <span className="font-medium text-slate-700">
                  نسبة الوزن المدخل من النصاب (85 جم عيار 24)
                </span>
                <span className="font-mono font-bold text-emerald-800">
                  {calculation.nisabProgressPct}%
                </span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-emerald-100">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    calculation.reachesNisab ? "bg-emerald-600" : "bg-amber-500"
                  }`}
                  style={{ width: `${calculation.nisabProgressPct}%` }}
                />
              </div>

              {calculation.reachesNisab ? (
                <div className="mt-3 flex items-start gap-2 rounded-xl bg-emerald-600/10 p-3 text-xs text-emerald-950">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
                  <div>
                    <p className="font-bold">
                      الوزن المدخل بلغ النصاب الشرعي ({calculation.pure24kGrams.toFixed(2)} جم صافي عيار 24).
                    </p>
                    <p className="mt-1 text-emerald-900">
                      مقدار الزكاة الواجبة (2.5% عند حولان الحول):{" "}
                      <strong className="font-mono">
                        {calculation.zakatGrams24k.toFixed(2)} جم عيار 24
                      </strong>{" "}
                      ويعادل{" "}
                      <strong className="font-mono">
                        {formatSdg(calculation.zakatDueSdg)} ج.س
                      </strong>
                      .
                    </p>
                  </div>
                </div>
              ) : (
                <div className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-950">
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
                  <p>
                    الوزن الصافي المكافئ ({calculation.pure24kGrams.toFixed(2)} جم عيار 24) لم يبلغ النصاب بعد؛ متبقي{" "}
                    <strong className="font-mono">
                      {calculation.remaining24kGrams.toFixed(2)} جم
                    </strong>{" "}
                    عيار 24 لبلوغ النصاب (85 جم).
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Summary Output Card */}
        <div className="flex flex-col justify-between rounded-3xl bg-slate-950 p-6 text-white shadow-xl lg:col-span-5">
          <div>
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <span className="inline-flex items-center gap-2 text-sm font-semibold text-amber-300">
                <Sparkles className="h-4 w-4" />
                نتيجة الحساب الفوري
              </span>
              <span className="rounded-full bg-slate-800 px-3 py-1 text-xs font-medium text-slate-300">
                {pricingTier === "parallel" ? "تسعير السوق الموازي" : "التسعير الرسمي"}
              </span>
            </div>

            <div className="mt-5 space-y-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-400">الوزن الإجمالي بالجرام</span>
                <span className="font-mono font-semibold text-white tabular-nums">
                  {calculation.totalGrams.toFixed(2)} جم
                </span>
              </div>

              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-400">سعر الجرام المختار</span>
                <span className="font-mono font-semibold text-white tabular-nums">
                  {formatSdg(calculation.perGramGoldSdg)} ج.س
                </span>
              </div>

              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-400">قيمة الذهب الصافي</span>
                <div className="text-left">
                  <span className="block font-mono font-bold text-white tabular-nums">
                    {formatSdg(calculation.goldValueSdg)} ج.س
                  </span>
                  <span
                    dir="ltr"
                    className="block font-mono text-xs text-slate-400 tabular-nums"
                  >
                    ${formatUsd(calculation.goldOnlyUsd)}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-400">إجمالي المصنعية</span>
                <span className="font-mono font-semibold text-amber-200 tabular-nums">
                  + {formatSdg(calculation.totalCraftsmanshipSdg)} ج.س
                </span>
              </div>
            </div>

            <div className="mt-6 rounded-2xl border border-amber-400/30 bg-gradient-to-br from-amber-500/15 to-amber-600/5 p-5">
              <span className="block text-xs font-medium text-amber-200/90">
                الإجمالي النهائي المطلوب
              </span>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="font-mono text-3xl font-bold text-amber-300 tabular-nums sm:text-4xl">
                  {formatSdg(calculation.grandTotalSdg)}
                </span>
                <span className="text-sm font-semibold text-slate-200">
                  ج.س
                </span>
              </div>
              <div
                dir="ltr"
                className="mt-1 font-mono text-sm font-medium text-slate-300 tabular-nums"
              >
                ≈ ${formatUsd(calculation.grandTotalUsd)} USD
              </div>
            </div>
          </div>

          <p className="mt-6 border-t border-slate-800 pt-4 text-xs leading-relaxed text-slate-400">
            ملاحظة: مصنعية الصاغة تختلف حسب المشغولات والمدينة ونوع التصميم،
            بينما يُحسب الذهب الكسر والسبائك غالباً بدون مصنعية أو بهامش تفاوض
            محدود.
          </p>
        </div>
      </div>
    </section>
  );
}

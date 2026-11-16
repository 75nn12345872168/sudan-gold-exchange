"use client";

import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Lock,
  RefreshCw,
  Send,
  ShieldCheck,
  AlertTriangle,
} from "lucide-react";
import {
  NISAB_24K_GRAMS,
  calculateKaratsFromUsdSdg,
  formatSdg,
  formatUsd,
} from "@/lib/gold-math";
import type { GoldPriceRecord } from "@/lib/types";

interface AdminUpdateFormProps {
  initialLatest: GoldPriceRecord;
}

export function AdminUpdateForm({ initialLatest }: AdminUpdateFormProps) {
  const [password, setPassword] = useState("");
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(false);

  const [ounceUsd, setOunceUsd] = useState(String(initialLatest.ounce_usd));
  const [parallelUsdSdg, setParallelUsdSdg] = useState(
    String(initialLatest.parallel_usd_sdg)
  );
  const [officialUsdSdg, setOfficialUsdSdg] = useState(
    String(initialLatest.official_usd_sdg)
  );
  const [craftsmanshipSdg, setCraftsmanshipSdg] = useState(
    String(initialLatest.craftsmanship_sdg)
  );
  const [notes, setNotes] = useState("تحديث ميداني من سوق الصاغة");
  const [sendTelegram, setSendTelegram] = useState(true);

  const [isFetchingSpot, setIsFetchingSpot] = useState(false);
  const [spotMessage, setSpotMessage] = useState<string | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitResult, setSubmitResult] = useState<{
    record: GoldPriceRecord;
    telegram: { sent: boolean; reason?: string };
  } | null>(null);

  const preview = useMemo(() => {
    const o = Number(ounceUsd) || 0;
    const p = Number(parallelUsdSdg) || 0;
    const off = Number(officialUsdSdg) || 0;
    return {
      parallel: calculateKaratsFromUsdSdg(o, p),
      official: calculateKaratsFromUsdSdg(o, off),
      nisabSdg: calculateKaratsFromUsdSdg(o, p).karat_24_sdg * NISAB_24K_GRAMS,
    };
  }, [ounceUsd, parallelUsdSdg, officialUsdSdg]);

  async function handleUnlock(e: FormEvent) {
    e.preventDefault();
    setAuthError(null);
    setIsCheckingAuth(true);

    try {
      const res = await fetch("/api/admin/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      const data = (await res.json()) as {
        authenticated?: boolean;
        latest?: GoldPriceRecord;
        error?: string;
      };

      if (!res.ok || !data.authenticated) {
        setAuthError(data.error || "كلمة المرور غير صحيحة.");
        return;
      }

      if (data.latest) {
        setOunceUsd(String(data.latest.ounce_usd));
        setParallelUsdSdg(String(data.latest.parallel_usd_sdg));
        setOfficialUsdSdg(String(data.latest.official_usd_sdg));
        setCraftsmanshipSdg(String(data.latest.craftsmanship_sdg));
      }

      setIsUnlocked(true);
    } catch {
      setAuthError("تعذر الاتصال بالخادم للتحقق من كلمة المرور.");
    } finally {
      setIsCheckingAuth(false);
    }
  }

  async function handleFetchSpotGold() {
    setIsFetchingSpot(true);
    setSpotMessage(null);
    try {
      const res = await fetch("/api/admin/spot-gold", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = (await res.json()) as {
        ounceUsd?: number;
        provider?: string;
        error?: string;
      };

      if (!res.ok || !data.ounceUsd) {
        setSpotMessage(data.error || "تعذر جلب السعر العالمي الآن.");
        return;
      }

      setOunceUsd(String(data.ounceUsd));
      setSpotMessage(
        `تم تحديث سعر الأونصة العالمية إلى $${formatUsd(data.ounceUsd)} (المصدر: ${data.provider})`
      );
    } catch {
      setSpotMessage("تعذر الاتصال بمزودي سعر الأونصة.");
    } finally {
      setIsFetchingSpot(false);
    }
  }

  async function handleSaveUpdate(e: FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitError(null);
    setSubmitResult(null);

    try {
      const res = await fetch("/api/admin/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password,
          ounceUsd: Number(ounceUsd),
          parallelUsdSdg: Number(parallelUsdSdg),
          officialUsdSdg: Number(officialUsdSdg),
          craftsmanshipSdg: Number(craftsmanshipSdg),
          notes,
          sendTelegram,
        }),
      });

      const data = (await res.json()) as {
        success?: boolean;
        record?: GoldPriceRecord;
        telegram?: { sent: boolean; reason?: string };
        error?: string;
      };

      if (!res.ok || !data.success || !data.record) {
        setSubmitError(data.error || "فشل حفظ التحديث.");
        return;
      }

      setSubmitResult({
        record: data.record,
        telegram: data.telegram ?? { sent: false },
      });
    } catch {
      setSubmitError("حدث خطأ في الشبكة أثناء حفظ التحديث.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!isUnlocked) {
    return (
      <div className="mx-auto max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-xl sm:p-8">
        <div className="mb-6 flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-amber-300">
            <Lock className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-xl font-bold text-slate-900">
              لوحة الإدارة الميدانية
            </h1>
            <p className="text-xs text-slate-500">
              محمية بكلمة مرور لتحديث سعر الدولار والذهب والنشر الفوري
            </p>
          </div>
        </div>

        <form onSubmit={handleUnlock} className="space-y-4">
          <div>
            <label
              htmlFor="admin-password"
              className="mb-1.5 block text-sm font-semibold text-slate-700"
            >
              كلمة مرور الإدارة (ADMIN_PASSWORD)
            </label>
            <input
              id="admin-password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              dir="ltr"
              placeholder="••••••••"
              className="w-full rounded-xl border border-slate-300 px-4 py-3 font-mono text-sm outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
            />
          </div>

          {authError && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-700">
              {authError}
            </div>
          )}

          <button
            type="submit"
            disabled={isCheckingAuth}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-bold text-amber-300 transition hover:bg-slate-900 disabled:opacity-60"
          >
            <ShieldCheck className="h-4 w-4" />
            {isCheckingAuth ? "جارٍ التحقق..." : "دخول لوحة التحديث"}
          </button>
        </form>

        <div className="mt-5 border-t border-slate-100 pt-4 text-center">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900"
          >
            <ArrowRight className="h-3.5 w-3.5" />
            العودة إلى لوحة الأسعار الرئيسية
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-lg font-bold text-slate-900 sm:text-xl">
              لوحة الإدارة الميدانية — تحديث الأسعار والنشر على تيليجرام
            </h1>
            <p className="text-xs text-slate-500">
              أي تعديل هنا يُعيد حساب جميع العيارات فوراً ويحفظ في Supabase وينشر
              نشرة تيليجرام.
            </p>
          </div>
        </div>

        <Link
          href="/"
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          <ArrowRight className="h-4 w-4" />
          عرض المنصة
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <form
          onSubmit={handleSaveUpdate}
          className="space-y-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-7"
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="parallel-usd"
                className="mb-1.5 block text-sm font-semibold text-slate-800"
              >
                سعر الدولار الموازي (ج.س)
              </label>
              <input
                id="parallel-usd"
                type="number"
                step="0.01"
                required
                value={parallelUsdSdg}
                onChange={(e) => setParallelUsdSdg(e.target.value)}
                dir="ltr"
                className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-right font-mono text-base font-bold text-slate-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
              />
            </div>

            <div>
              <label
                htmlFor="official-usd"
                className="mb-1.5 block text-sm font-semibold text-slate-800"
              >
                سعر الدولار الرسمي (ج.س)
              </label>
              <input
                id="official-usd"
                type="number"
                step="0.01"
                required
                value={officialUsdSdg}
                onChange={(e) => setOfficialUsdSdg(e.target.value)}
                dir="ltr"
                className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-right font-mono text-base font-bold text-slate-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
              />
            </div>
          </div>

          <div>
            <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
              <label
                htmlFor="ounce-usd"
                className="text-sm font-semibold text-slate-800"
              >
                سعر الأونصة العالمي (XAU/USD)
              </label>
              <button
                type="button"
                onClick={handleFetchSpotGold}
                disabled={isFetchingSpot}
                className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-60"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${isFetchingSpot ? "animate-spin" : ""}`}
                />
                {isFetchingSpot ? "جارٍ الجلب..." : "جلب السعر العالمي الآن"}
              </button>
            </div>
            <input
              id="ounce-usd"
              type="number"
              step="0.01"
              required
              value={ounceUsd}
              onChange={(e) => setOunceUsd(e.target.value)}
              dir="ltr"
              className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-right font-mono text-base font-bold text-slate-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
            />
            {spotMessage && (
              <p className="mt-1.5 text-xs text-slate-600">{spotMessage}</p>
            )}
          </div>

          <div>
            <label
              htmlFor="craftsmanship-sdg"
              className="mb-1.5 block text-sm font-semibold text-slate-800"
            >
              مصنعية الصاغة المعتمدة للجرام (ج.س)
            </label>
            <input
              id="craftsmanship-sdg"
              type="number"
              min="0"
              step="100"
              required
              value={craftsmanshipSdg}
              onChange={(e) => setCraftsmanshipSdg(e.target.value)}
              dir="ltr"
              className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-right font-mono text-base font-bold text-slate-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
            />
          </div>

          <div>
            <label
              htmlFor="admin-notes"
              className="mb-1.5 block text-sm font-semibold text-slate-800"
            >
              ملاحظة أو مصدر التحديث الميداني
            </label>
            <input
              id="admin-notes"
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="مثال: تحديث صاغة الخرطوم وبورتسودان - الفترة المسائية"
              className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm text-slate-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
            />
          </div>

          <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-sm font-medium text-slate-800">
            <input
              type="checkbox"
              checked={sendTelegram}
              onChange={(e) => setSendTelegram(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
            />
            <span>نشر نشرة محدثة على قناة تيليجرام تلقائياً فور الحفظ</span>
          </label>

          {submitError && (
            <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-xs font-medium text-rose-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{submitError}</span>
            </div>
          )}

          {submitResult && (
            <div className="space-y-1.5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-950">
              <div className="flex items-center gap-2 font-bold">
                <CheckCircle2 className="h-4 w-4 text-emerald-700" />
                <span>تم حفظ الأسعار الجديدة في قاعدة البيانات بنجاح!</span>
              </div>
              <p className="text-emerald-900">
                حالة تيليجرام:{" "}
                <strong>
                  {submitResult.telegram.sent
                    ? "تم النشر على القناة بنجاح."
                    : `لم يُنشر (${submitResult.telegram.reason})`}
                </strong>
              </p>
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 py-3.5 text-sm font-bold text-amber-300 shadow-md transition hover:bg-slate-900 disabled:opacity-60"
          >
            <Send className="h-4 w-4" />
            {isSubmitting
              ? "جارٍ إعادة الحساب والحفظ والنشر..."
              : "حفظ التحديث وإعادة الحساب والنشر"}
          </button>
        </form>

        {/* Live Calculation Preview */}
        <div className="rounded-3xl bg-slate-950 p-6 text-white shadow-xl lg:col-span-5">
          <h2 className="border-b border-slate-800 pb-3 text-base font-bold text-amber-300">
            معاينة فورية قبل الحفظ (السوق الموازي)
          </h2>

          <div className="mt-4 space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">عيار 24 (للجرام)</span>
              <span className="font-mono font-bold text-white tabular-nums">
                {formatSdg(preview.parallel.karat_24_sdg)} ج.س
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">عيار 22 (للجرام)</span>
              <span className="font-mono font-bold text-white tabular-nums">
                {formatSdg(preview.parallel.karat_22_sdg)} ج.س
              </span>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-amber-500/15 px-3 py-2">
              <span className="font-semibold text-amber-200">
                عيار 21 (للجرام)
              </span>
              <span className="font-mono text-base font-bold text-amber-300 tabular-nums">
                {formatSdg(preview.parallel.karat_21_sdg)} ج.س
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">عيار 18 (للجرام)</span>
              <span className="font-mono font-bold text-white tabular-nums">
                {formatSdg(preview.parallel.karat_18_sdg)} ج.س
              </span>
            </div>
            <div className="flex items-center justify-between border-t border-slate-800 pt-3">
              <span className="text-slate-300">الجنيه الذهب (8 جم عيار 21)</span>
              <span className="font-mono font-bold text-amber-200 tabular-nums">
                {formatSdg(preview.parallel.gold_pound_sdg)} ج.س
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">نصاب الزكاة (85 جم 24K)</span>
              <span className="font-mono font-semibold text-emerald-300 tabular-nums">
                {formatSdg(preview.nisabSdg)} ج.س
              </span>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/70 p-4 text-xs text-slate-300">
            <div className="font-bold text-slate-200">
              المعادل بالسعر الرسمي ({formatSdg(Number(officialUsdSdg) || 0)} ج.س):
            </div>
            <div className="mt-2 flex justify-between">
              <span>عيار 24 الرسمي:</span>
              <span className="font-mono">
                {formatSdg(preview.official.karat_24_sdg)} ج.س
              </span>
            </div>
            <div className="mt-1 flex justify-between">
              <span>عيار 21 الرسمي:</span>
              <span className="font-mono">
                {formatSdg(preview.official.karat_21_sdg)} ج.س
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

import Link from "next/link";
import { Send, ShieldCheck, Coins } from "lucide-react";
import { formatArabicDateTime, formatSdg, formatUsd } from "@/lib/gold-math";
import { getTelegramChannelUrl } from "@/lib/site";
import type { GoldPriceRecord } from "@/lib/types";

interface TopTickerBarProps {
  latest: GoldPriceRecord;
  isFallback: boolean;
}

export function TopTickerBar({ latest, isFallback }: TopTickerBarProps) {
  const telegramUrl = getTelegramChannelUrl();

  return (
    <header className="sticky top-0 z-40 border-b border-amber-500/25 bg-slate-950/95 text-slate-100 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-amber-400/40 bg-gradient-to-br from-amber-400/20 to-amber-600/10 text-amber-300 shadow-inner">
              <Coins className="h-5 w-5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-bold tracking-tight text-white sm:text-lg">
                  بورصة الذهب السودانية
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-300">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                  {isFallback ? "مرجعي" : "مباشر"}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                آخر تحديث: {formatArabicDateTime(latest.recorded_at)}
              </p>
            </div>
          </Link>

          <div className="flex items-center gap-2 lg:hidden">
            <a
              href={telegramUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg bg-sky-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-sky-400"
            >
              <Send className="h-3.5 w-3.5" />
              قناة تيليجرام
            </a>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <div className="rounded-lg border border-slate-800 bg-slate-900/90 px-3 py-1.5">
              <span className="block text-[11px] text-slate-400">
                الأونصة العالمية (XAU/USD)
              </span>
              <span
                dir="ltr"
                className="font-mono text-sm font-bold text-amber-300 tabular-nums"
              >
                ${formatUsd(latest.ounce_usd)}
              </span>
            </div>

            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5">
              <span className="block text-[11px] text-amber-200/80">
                الدولار الموازي المعتمد
              </span>
              <span className="font-mono text-sm font-bold text-white tabular-nums">
                {formatSdg(latest.parallel_usd_sdg)}{" "}
                <span className="font-sans text-xs font-medium text-amber-200">
                  ج.س
                </span>
              </span>
            </div>

            <div className="hidden rounded-lg border border-slate-800 bg-slate-900/90 px-3 py-1.5 sm:block">
              <span className="block text-[11px] text-slate-400">
                الدولار الرسمي
              </span>
              <span className="font-mono text-sm font-semibold text-slate-200 tabular-nums">
                {formatSdg(latest.official_usd_sdg)}{" "}
                <span className="font-sans text-xs font-normal text-slate-400">
                  ج.س
                </span>
              </span>
            </div>
          </div>

          <div className="hidden items-center gap-2 lg:flex">
            <a
              href={telegramUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-l from-sky-500 to-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-sky-900/30 transition hover:from-sky-400 hover:to-sky-500"
            >
              <Send className="h-4 w-4" />
              اشترك في قناة تيليجرام
            </a>

            <Link
              href="/admin/update"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-medium text-slate-300 transition hover:border-amber-400/40 hover:text-amber-200"
            >
              <ShieldCheck className="h-4 w-4 text-amber-400" />
              لوحة الإدارة
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}

import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { runAutoMarketSync } from "@/lib/auto-sync";
import { createPublicSupabaseClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (cronSecret) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  let baselineParallel: number | undefined;
  let baselineOfficial: number | undefined;
  let baselineCraftsmanship: number | undefined;
  let previousKarat24: number | null = null;

  const supabase = createPublicSupabaseClient();
  if (supabase) {
    try {
      const [{ data: fxRows }, { data: goldRows }] = await Promise.all([
        supabase
          .from("exchange_rates")
          .select("parallel_usd_sdg, official_usd_sdg, craftsmanship_sdg")
          .order("recorded_at", { ascending: false })
          .limit(10),
        supabase
          .from("gold_prices")
          .select("karat_24_sdg, parallel_usd_sdg")
          .order("recorded_at", { ascending: false })
          .limit(10),
      ]);

      const validFx = fxRows?.find((r) => {
        const rate = Number(r.parallel_usd_sdg);
        return Number.isFinite(rate) && rate >= 500 && rate <= 50000;
      });
      if (validFx) {
        baselineParallel = Number(validFx.parallel_usd_sdg);
        baselineOfficial = Number(validFx.official_usd_sdg);
        baselineCraftsmanship = Number(validFx.craftsmanship_sdg);
      }

      const validGold = goldRows?.find((r) => {
        const rate = Number(r.parallel_usd_sdg);
        return Number.isFinite(rate) && rate >= 500 && rate <= 50000;
      });
      if (validGold) {
        previousKarat24 = Number(validGold.karat_24_sdg);
      }
    } catch {
      // Proceed with env defaults
    }
  }

  const notify = request.nextUrl.searchParams.get("notify") === "1";
  const debug = request.nextUrl.searchParams.get("debug") === "1";
  const result = await runAutoMarketSync({
    baselineParallel,
    baselineOfficial,
    baselineCraftsmanship,
    previousKarat24,
    persistToSupabase: true,
    sendTelegram: notify,
    forceRefresh: true,
  });

  if (!result) {
    return NextResponse.json(
      { ok: false, error: "تعذر جلب الأسعار الحية من المصادر الخارجية." },
      { status: 502 }
    );
  }

  revalidatePath("/");
  return NextResponse.json({
    ok: true,
    persisted: result.persisted,
    record: result.gold,
    telegram: result.telegram,
    ...(debug ? { fxDiagnostics: result.fxDiagnostics } : {}),
  });
}

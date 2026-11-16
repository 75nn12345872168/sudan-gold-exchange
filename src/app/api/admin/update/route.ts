import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { verifyAdminPassword } from "@/lib/admin-auth";
import { calculateChangePct, calculateKaratsFromUsdSdg } from "@/lib/gold-math";
import { createAdminSupabaseClient } from "@/lib/supabase";
import { formatGoldBulletinArabic, sendTelegramBulletin } from "@/lib/telegram";
import type { GoldPriceRecord } from "@/lib/types";

interface AdminUpdatePayload {
  password?: string;
  ounceUsd?: number;
  parallelUsdSdg?: number;
  officialUsdSdg?: number;
  craftsmanshipSdg?: number;
  notes?: string;
  sendTelegram?: boolean;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as AdminUpdatePayload;

    if (!verifyAdminPassword(body.password)) {
      return NextResponse.json(
        { error: "كلمة مرور الإدارة غير صحيحة." },
        { status: 401 }
      );
    }

    const ounceUsd = Number(body.ounceUsd);
    const parallelUsdSdg = Number(body.parallelUsdSdg);
    const officialUsdSdg = Number(body.officialUsdSdg);
    const craftsmanshipSdg = Number(body.craftsmanshipSdg ?? 0);

    if (
      !Number.isFinite(ounceUsd) ||
      ounceUsd <= 0 ||
      !Number.isFinite(parallelUsdSdg) ||
      parallelUsdSdg <= 0 ||
      !Number.isFinite(officialUsdSdg) ||
      officialUsdSdg <= 0 ||
      !Number.isFinite(craftsmanshipSdg) ||
      craftsmanshipSdg < 0
    ) {
      return NextResponse.json(
        { error: "يرجى إدخال قيم رقمية صحيحة وموجبة للأسعار." },
        { status: 400 }
      );
    }

    const supabase = createAdminSupabaseClient();

    // Fetch latest karat_24_sdg for accurate change_pct calculation
    const { data: prevRows } = await supabase
      .from("gold_prices")
      .select("karat_24_sdg")
      .order("recorded_at", { ascending: false })
      .limit(1);

    const previousKarat24 =
      prevRows && prevRows.length > 0 ? Number(prevRows[0].karat_24_sdg) : null;

    const computed = calculateKaratsFromUsdSdg(ounceUsd, parallelUsdSdg);
    const changePct = calculateChangePct(computed.karat_24_sdg, previousKarat24);
    const nowIso = new Date().toISOString();
    const notes = body.notes?.trim() || "تحديث ميداني مباشر من لوحة الإدارة";

    const { error: fxError } = await supabase.from("exchange_rates").insert({
      recorded_at: nowIso,
      parallel_usd_sdg: parallelUsdSdg,
      official_usd_sdg: officialUsdSdg,
      craftsmanship_sdg: craftsmanshipSdg,
      source: "field_admin",
      notes,
    });

    if (fxError) {
      return NextResponse.json(
        { error: `فشل تحديث جدول أسعار الصرف: ${fxError.message}` },
        { status: 500 }
      );
    }

    const { data: insertedGold, error: goldError } = await supabase
      .from("gold_prices")
      .insert({
        recorded_at: nowIso,
        ounce_usd: ounceUsd,
        parallel_usd_sdg: parallelUsdSdg,
        official_usd_sdg: officialUsdSdg,
        ...computed,
        craftsmanship_sdg: craftsmanshipSdg,
        change_pct: changePct,
        source: "field_admin",
        notes,
      })
      .select("*")
      .single();

    if (goldError || !insertedGold) {
      return NextResponse.json(
        {
          error: `فشل حفظ أسعار الذهب في قاعدة البيانات: ${goldError?.message ?? "خطأ غير معروف"}`,
        },
        { status: 500 }
      );
    }

    const record: GoldPriceRecord = {
      id: String(insertedGold.id),
      recorded_at: String(insertedGold.recorded_at),
      ounce_usd: Number(insertedGold.ounce_usd),
      parallel_usd_sdg: Number(insertedGold.parallel_usd_sdg),
      official_usd_sdg: Number(insertedGold.official_usd_sdg),
      karat_24_sdg: Number(insertedGold.karat_24_sdg),
      karat_22_sdg: Number(insertedGold.karat_22_sdg),
      karat_21_sdg: Number(insertedGold.karat_21_sdg),
      karat_18_sdg: Number(insertedGold.karat_18_sdg),
      gold_pound_sdg: Number(insertedGold.gold_pound_sdg),
      craftsmanship_sdg: Number(insertedGold.craftsmanship_sdg ?? craftsmanshipSdg),
      change_pct: Number(insertedGold.change_pct ?? changePct),
      source: String(insertedGold.source),
      notes: insertedGold.notes ? String(insertedGold.notes) : null,
    };

    let telegram = { sent: false, reason: "تم تعطيل النشر التلقائي لهذا التحديث." };
    if (body.sendTelegram !== false) {
      const bulletin = formatGoldBulletinArabic(record);
      const result = await sendTelegramBulletin(bulletin);
      telegram = {
        sent: result.sent,
        reason: result.reason ?? "تم النشر بنجاح على قناة تيليجرام.",
      };
    }

    revalidatePath("/");

    return NextResponse.json({
      success: true,
      record,
      telegram,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "حدث خطأ غير متوقع أثناء الحفظ.",
      },
      { status: 500 }
    );
  }
}

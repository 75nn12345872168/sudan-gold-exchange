import {
  NISAB_24K_GRAMS,
  formatArabicDateTime,
  formatChangePct,
  formatSdg,
  formatUsd,
} from "./gold-math";
import { getSiteUrl } from "./site";
import type { GoldPriceRecord } from "./types";

export interface TelegramSendResult {
  sent: boolean;
  reason?: string;
}

export function formatGoldBulletinArabic(record: GoldPriceRecord): string {
  const siteUrl = getSiteUrl();
  const arrow =
    record.change_pct > 0 ? "📈" : record.change_pct < 0 ? "📉" : "➖";
  const nisabSdg = record.karat_24_sdg * NISAB_24K_GRAMS;
  const lines = [
    "🪙 *نشرة أسعار الذهب في السودان — تحديث فوري*",
    `🕒 ${formatArabicDateTime(record.recorded_at)} (توقيت السودان)`,
    "",
    `🌍 *الأونصة العالمية:* $${formatUsd(record.ounce_usd)}`,
    `💵 *الدولار الموازي المعتمد:* ${formatSdg(record.parallel_usd_sdg)} ج.س`,
    `🏦 *الدولار الرسمي:* ${formatSdg(record.official_usd_sdg)} ج.س`,
    `📡 *مصدر التحديث:* \`${record.source}\``,
    "",
    "📊 *أسعار الجرام في السوق السوداني (بالدولار الموازي):*",
    `• *عيار 24:* ${formatSdg(record.karat_24_sdg)} ج.س`,
    `• *عيار 22:* ${formatSdg(record.karat_22_sdg)} ج.س`,
    `• *عيار 21 (الأكثر طلباً):* ${formatSdg(record.karat_21_sdg)} ج.س`,
    `• *عيار 18:* ${formatSdg(record.karat_18_sdg)} ج.س`,
    `• *الجنيه الذهب (8 جرام عيار 21):* ${formatSdg(record.gold_pound_sdg)} ج.س`,
  ];

  if (record.craftsmanship_sdg > 0) {
    lines.push(
      `🔨 *متوسط مصنعية الصاغة:* ${formatSdg(record.craftsmanship_sdg)} ج.س / جرام`
    );
  }

  lines.push(
    `${arrow} *التغير عن القراءة السابقة:* ${formatChangePct(record.change_pct)}`,
    `🕌 *نصاب زكاة الذهب (85 جم عيار 24):* ${formatSdg(nisabSdg)} ج.س`
  );

  if (record.notes) {
    lines.push(`📝 *ملاحظة:* ${record.notes}`);
  }

  lines.push(
    "",
    "🔗 حاسبة الذهب والمصنعية والزكاة والأسعار المباشرة:",
    siteUrl
  );

  return lines.join("\n");
}

export async function sendTelegramBulletin(
  messageText: string
): Promise<TelegramSendResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const channelId = process.env.TELEGRAM_CHANNEL_ID?.trim();

  if (!token || !channelId) {
    return {
      sent: false,
      reason: "متغيرات تيليجرام (TELEGRAM_BOT_TOKEN / TELEGRAM_CHANNEL_ID) غير مضبوطة.",
    };
  }

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: channelId,
          text: messageText,
          parse_mode: "Markdown",
          disable_web_page_preview: false,
        }),
        signal: AbortSignal.timeout(8000),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      return {
        sent: false,
        reason: `Telegram API (${response.status}): ${errorText.slice(0, 160)}`,
      };
    }

    return { sent: true };
  } catch (error) {
    return {
      sent: false,
      reason: error instanceof Error ? error.message : "خطأ غير متوقع في إرسال تيليجرام",
    };
  }
}

export const DEFAULT_SITE_URL = "https://sudan-gold-exchange.vercel.app";
export const DEFAULT_TELEGRAM_URL = "https://t.me/sudan_gold_exchange";

export function getSiteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) {
    return configured.replace(/\/+$/, "");
  }

  const vercelProd = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercelProd) {
    return `https://${vercelProd.replace(/\/+$/, "")}`;
  }

  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelUrl) {
    return `https://${vercelUrl.replace(/\/+$/, "")}`;
  }

  return DEFAULT_SITE_URL;
}

export function getTelegramChannelUrl(): string {
  const configuredUrl = process.env.NEXT_PUBLIC_TELEGRAM_CHANNEL_URL?.trim();
  if (configuredUrl) {
    return configuredUrl;
  }

  const channelId = process.env.TELEGRAM_CHANNEL_ID?.trim();
  if (channelId && channelId.startsWith("@")) {
    return `https://t.me/${channelId.slice(1)}`;
  }

  return DEFAULT_TELEGRAM_URL;
}

import type { Metadata } from "next";
import { getSiteUrl } from "@/lib/site";
import "./globals.css";

const SITE_TITLE =
  "أسعار الذهب اليوم في السودان لحظة بلحظة | عيار 21 و24 والجنيه الذهب";
const SITE_DESCRIPTION =
  "منصة أسعار الذهب في السودان لحظة بلحظة: سعر جرام الذهب عيار 24 و22 و21 و18 والجنيه الذهب بالجنيه السوداني وفق سعر الدولار الموازي والرسمي، مع حاسبة الذهب والمصنعية ونصاب الزكاة ورسم بياني لآخر 30 يوماً.";

const googleVerification = process.env.GOOGLE_SITE_VERIFICATION?.trim();

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: {
    default: SITE_TITLE,
    template: "%s | منصة أسعار الذهب في السودان",
  },
  description: SITE_DESCRIPTION,
  keywords: [
    "أسعار الذهب اليوم في السودان",
    "سعر جرام الذهب عيار 21 في السودان",
    "سعر جرام الذهب عيار 24 في السودان",
    "سعر الجنيه الذهب في السودان",
    "سعر الدولار الموازي في السودان",
    "حاسبة الذهب والمصنعية السودان",
    "نصاب زكاة الذهب بالجنيه السوداني",
    "سوق الصاغة السودان",
    "سعر أونصة الذهب اليوم",
    "Sudan gold price today",
  ],
  alternates: {
    canonical: "/",
  },
  ...(googleVerification
    ? {
        verification: {
          google: googleVerification,
        },
      }
    : {}),
  openGraph: {
    type: "website",
    locale: "ar_SD",
    siteName: "منصة أسعار الذهب في السودان | Sudan Gold Exchange",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen font-sans antialiased selection:bg-amber-200 selection:text-amber-950">
        {children}
      </body>
    </html>
  );
}

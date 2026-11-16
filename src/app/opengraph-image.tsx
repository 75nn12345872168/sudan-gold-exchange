import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "منصة أسعار الذهب في السودان لحظة بلحظة";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px",
          background:
            "linear-gradient(135deg, #090d16 0%, #111827 55%, #2b2108 100%)",
          color: "#f8fafc",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              padding: "10px 20px",
              borderRadius: "9999px",
              background: "rgba(212, 175, 55, 0.16)",
              border: "1px solid rgba(250, 204, 21, 0.4)",
              color: "#fde047",
              fontSize: "24px",
              fontWeight: 700,
            }}
          >
            SUDAN GOLD EXCHANGE
          </div>
          <div
            style={{
              fontSize: "24px",
              color: "#cbd5e1",
            }}
          >
            sudan-gold-exchange.vercel.app
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "20px",
            textAlign: "right",
            alignItems: "flex-end",
          }}
        >
          <div
            style={{
              fontSize: "62px",
              fontWeight: 800,
              color: "#fef08a",
              lineHeight: 1.2,
            }}
          >
            أسعار الذهب في السودان لحظة بلحظة
          </div>
          <div
            style={{
              fontSize: "30px",
              color: "#e2e8f0",
              maxWidth: "960px",
              lineHeight: 1.4,
            }}
          >
            عيار 24 • عيار 22 • عيار 21 • عيار 18 • الجنيه الذهب • حاسبة
            المصنعية ونصاب الزكاة
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderTop: "1px solid rgba(255,255,255,0.14)",
            paddingTop: "24px",
            fontSize: "22px",
            color: "#94a3b8",
          }}
        >
          <div>XAU/USD + Parallel & Official SDG Pricing</div>
          <div style={{ color: "#facc15" }}>تحديث آلي مستمر + قناة تيليجرام</div>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}

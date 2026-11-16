import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "sudan-gold-exchange",
    timestamp: new Date().toISOString(),
  });
}

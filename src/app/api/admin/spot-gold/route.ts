import { NextRequest, NextResponse } from "next/server";
import { verifyAdminPassword } from "@/lib/admin-auth";
import { fetchLiveSpotGoldUsd } from "@/lib/spot-gold";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { password?: string };
    if (!verifyAdminPassword(body.password)) {
      return NextResponse.json(
        { error: "غير مصرح: كلمة مرور الإدارة غير صحيحة." },
        { status: 401 }
      );
    }

    const spot = await fetchLiveSpotGoldUsd();
    return NextResponse.json(spot);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "تعذر جلب سعر الأونصة العالمي.",
      },
      { status: 502 }
    );
  }
}

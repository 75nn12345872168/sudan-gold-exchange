import { NextRequest, NextResponse } from "next/server";
import { verifyAdminPassword } from "@/lib/admin-auth";
import { getDashboardData } from "@/lib/gold-service";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { password?: string };
    if (!verifyAdminPassword(body.password)) {
      return NextResponse.json(
        { error: "كلمة مرور الإدارة غير صحيحة." },
        { status: 401 }
      );
    }

    const data = await getDashboardData();
    return NextResponse.json({
      authenticated: true,
      latest: data.latest,
      latestExchangeRate: data.latestExchangeRate,
      isFallback: data.isFallback,
    });
  } catch {
    return NextResponse.json(
      { error: "تعذر التحقق من الطلب." },
      { status: 400 }
    );
  }
}

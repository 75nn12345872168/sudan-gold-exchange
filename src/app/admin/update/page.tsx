import type { Metadata } from "next";
import { AdminUpdateForm } from "@/components/AdminUpdateForm";
import { getDashboardData } from "@/lib/gold-service";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "لوحة الإدارة الميدانية",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function AdminUpdatePage() {
  const data = await getDashboardData();

  return (
    <main className="min-h-screen bg-[#f8f7f4] px-4 py-10 sm:px-6 lg:px-8">
      <AdminUpdateForm initialLatest={data.latest} />
    </main>
  );
}

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

type OnboardingPayload = {
  mode: "manual" | "integration";
  fullName: string;
  companyName: string;
  businessType: string;
  outletName: string;
  outletCode: string;
  address: string;
  city: string;
  country: string;
  timezone: string;
  currency: string;
};

export async function POST(request: Request) {
  const fieldLabels: Record<keyof OnboardingPayload, string> = {
    mode: "Cara mulai", fullName: "Nama kamu", companyName: "Nama bisnis", businessType: "Jenis bisnis",
    outletName: "Nama outlet", outletCode: "Kode outlet", address: "Alamat outlet",
    city: "Kota", country: "Negara", timezone: "Zona waktu", currency: "Mata uang",
  };
  let input: unknown;
  try { input = await request.json(); }
  catch { return NextResponse.json({ error: "Format data tidak valid. Coba kirim kembali." }, { status: 400 }); }
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return NextResponse.json({ error: "Lengkapi data profil dan outlet terlebih dahulu." }, { status: 400 });
  }
  const mode = (input as Record<string, unknown>).mode ?? "manual";
  if (mode !== "manual" && mode !== "integration") return NextResponse.json({ error: "Pilih hubungkan POS/ERP atau tambah outlet manual." }, { status: 400 });
  const payload = { mode } as OnboardingPayload;
  const outletFields = ["outletName", "outletCode", "address", "city", "country"];
  for (const field of Object.keys(fieldLabels) as Array<keyof OnboardingPayload>) {
    if (field === "mode" || (mode === "integration" && outletFields.includes(field))) continue;
    const value = (input as Record<string, unknown>)[field];
    if (typeof value !== "string" || !value.trim()) return NextResponse.json({ error: `${fieldLabels[field]} wajib diisi.` }, { status: 400 });
    payload[field] = value.trim();
  }
  // Older tabs submitted option labels. Keep those submissions compatible while
  // the form now sends canonical values instead of display text.
  payload.timezone = payload.timezone.replace(/\s+\(GMT[+-]\d{1,2}(?::\d{2})?\)$/, "");
  payload.currency = payload.currency.split(" - ")[0];
  try { new Intl.DateTimeFormat("id-ID", { timeZone: payload.timezone }); }
  catch { return NextResponse.json({ error: "Zona waktu tidak valid. Pilih kembali zona waktu outlet." }, { status: 400 }); }
  if (!/^[A-Z]{3}$/.test(payload.currency)) return NextResponse.json({ error: "Mata uang tidak valid. Pilih kembali mata uang outlet." }, { status: 400 });

  if (process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || process.env.CLERK_SECRET_KEY) {
    if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || !process.env.CLERK_SECRET_KEY) return NextResponse.json({ error: "Konfigurasi login belum lengkap. Hubungi administrator." }, { status: 503 });
    try {
      const { getToken } = await auth();
      const clerkToken = await getToken();
      if (!clerkToken) return NextResponse.json({ error: "Sesi login berakhir. Silakan masuk kembali." }, { status: 401 });
      const apiResponse = await fetch(`${process.env.API_BASE_URL ?? "http://localhost:4000"}/v1/onboarding`, {
        method: "POST",
        headers: { Authorization: `Bearer ${clerkToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
      });
      const apiResult = (await apiResponse.json()) as { data?: { token?: string }; error?: { message?: string; details?: { issues?: Array<{ path?: unknown[] }> } } };
      if (!apiResponse.ok) {
        const fields = Array.isArray(apiResult.error?.details?.issues)
          ? [...new Set(apiResult.error.details.issues.map(issue => fieldLabels[issue.path?.[0] as keyof OnboardingPayload]).filter(Boolean))]
          : [];
        const message = fields.length ? `Periksa kembali: ${fields.join(", ")}. Nilai belum sesuai.`
          : apiResult.error?.message && apiResult.error.message !== "Invalid request" ? apiResult.error.message : "Data belum valid. Periksa kembali profil dan outlet.";
        return NextResponse.json({ error: message }, { status: apiResponse.status });
      }
      if (!apiResult.data?.token) return NextResponse.json({ error: "Konfirmasi penyimpanan belum diterima. Coba kirim kembali." }, { status: 502 });
      const response = NextResponse.json({ ok: true });
      response.cookies.delete("ganita_ai_token");
      return response;
    } catch {
      return NextResponse.json({ error: "Server belum dapat menyimpan data. Isian tetap tersedia; silakan coba lagi." }, { status: 502 });
    }
  }

  return NextResponse.json({ error: "Login belum dikonfigurasi. Profil belum disimpan; hubungi administrator." }, { status: 503 });
}

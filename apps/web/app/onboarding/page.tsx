"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Building2, Check, MapPin, Plug, Store, BookOpen } from "lucide-react";
import { FormEvent, useState } from "react";
import { BrandLockup } from "../../components/brand-lockup";
import { ApiKeysPanel } from "../../components/api-keys-panel";

type FormState = {
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

const initialForm: FormState = {
  fullName: "",
  companyName: "",
  businessType: "Restoran",
  outletName: "",
  outletCode: "",
  address: "",
  city: "",
  country: "Indonesia",
  timezone: "Asia/Jakarta",
  currency: "IDR"
};

const inputClass = "mt-2 h-11 w-full rounded-lg border border-ink/12 bg-white px-3 text-sm text-ink outline-none transition placeholder:text-ink/35 focus:border-teal focus:ring-2 focus:ring-teal/10";

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormState>(initialForm);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<"integration" | "manual" | null>(null);
  const [workspaceReady, setWorkspaceReady] = useState(false);

  const update = (field: keyof FormState, value: string) => setForm((current) => ({ ...current, [field]: value }));

  const continueToOutlet = (event: FormEvent) => {
    event.preventDefault();
    if (!form.fullName.trim() || !form.companyName.trim()) {
      setError("Isi nama dan nama bisnis terlebih dahulu.");
      return;
    }
    setError("");
    setStep(2);
  };

  const finish = async (event: FormEvent) => {
    event.preventDefault();
    if (!mode || saving) return;
    setError("");
    setSaving(true);
    try {
      const response = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, mode })
      });
      const result = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || result.ok !== true) throw new Error(result.error || "Data belum dapat disimpan.");
      if (mode === "integration") setWorkspaceReady(true);
      else router.push("/dashboard?onboarding=complete");
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "Data belum dapat disimpan.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#f5fbf9] px-4 py-6 text-ink sm:px-6 lg:px-10">
      <div className="mx-auto grid min-h-[calc(100vh-3rem)] max-w-6xl overflow-hidden rounded-2xl border border-teal/10 bg-white shadow-panel lg:grid-cols-[0.78fr_1.22fr]">
        <aside className="relative flex flex-col justify-between gap-6 overflow-hidden bg-[#18221d] px-7 py-8 text-white sm:px-10">
          <div className="relative z-10">
            <div className="flex items-center gap-3">
              <Image src="/brand/ganita-ai-avatar.png" alt="Avatar GANITA.ai" width={48} height={48} className="shrink-0 rounded-xl" />
              <BrandLockup inverse />
            </div>
            <div className="mt-8 grid grid-cols-[minmax(0,1fr)_104px] items-center gap-3 sm:grid-cols-[minmax(0,1fr)_160px] lg:mt-12 lg:block">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase text-aqua">Mulai bersama Ganita</p>
                <h1 className="mt-3 text-2xl font-semibold leading-tight sm:text-3xl">Kenalan dulu dengan bisnis kamu.</h1>
                <p className="mt-4 hidden text-sm leading-7 text-white/70 lg:block">Ganita akan membantu membaca kesehatan outlet, menemukan kebocoran profit, dan memberi resep tindakan yang lebih jelas.</p>
              </div>
              <div className="relative aspect-square w-full lg:mx-auto lg:mt-6 lg:max-w-[320px]">
                <Image
                  src="/brand/ganita-onboarding-guide-v1.png"
                  alt="Ganita duduk sambil mengedip, membawa checklist dan menunjuk ke formulir"
                  width={1254}
                  height={1254}
                  sizes="(min-width: 1024px) 320px, (min-width: 640px) 160px, 104px"
                  priority
                  className="h-full w-full object-contain"
                  style={{ maskImage: "linear-gradient(to bottom, transparent, black 2%, black 98%, transparent)" }}
                />
              </div>
            </div>
          </div>
          <p className="relative z-10 text-xs text-white/70">Persiapan pertama hanya beberapa menit.</p>
        </aside>

        <section className="px-6 py-8 sm:px-10 lg:px-14 lg:py-12">
          <div className="mx-auto max-w-xl">
            <div className="flex items-center justify-between gap-4">
              <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-teal">Setup akun</p><h2 className="mt-2 text-2xl font-semibold">Siapkan ruang kerja Ganita</h2></div>
              <p className="shrink-0 whitespace-nowrap text-sm font-semibold text-ink/45">{step} / 2</p>
            </div>
            <div className="mt-7 grid grid-cols-2 gap-2" aria-label="Progress onboarding">
              {["Profil bisnis", "Cara mulai"].map((label, index) => { const current = index + 1; return <div key={label}><div className={`h-1.5 rounded-full ${step >= current ? "bg-teal" : "bg-ink/10"}`} /><p className={`mt-2 text-xs font-semibold ${step >= current ? "text-teal" : "text-ink/40"}`}>{current}. {label}</p></div>; })}
            </div>

            {step === 1 ? <form className="mt-10 space-y-5" onSubmit={continueToOutlet}>
              <div className="grid gap-5 sm:grid-cols-2">
                <label className="text-sm font-semibold">Nama kamu<input className={inputClass} value={form.fullName} onChange={(event) => update("fullName", event.target.value)} placeholder="Contoh: Andi Wijaya" required /></label>
                <label className="text-sm font-semibold">Nama bisnis / brand<input className={inputClass} value={form.companyName} onChange={(event) => update("companyName", event.target.value)} placeholder="Contoh: Kedai Senja" required /></label>
              </div>
              <label className="text-sm font-semibold">Jenis bisnis<select className={inputClass} value={form.businessType} onChange={(event) => update("businessType", event.target.value)}><option>Restoran</option><option>Kafe</option><option>Toko roti</option><option>Pujasera</option><option>Jaringan multi-brand</option></select></label>
              <div className="grid gap-5 sm:grid-cols-2"><label className="text-sm font-semibold">Zona waktu<select className={inputClass} value={form.timezone} onChange={(event) => update("timezone", event.target.value)}><option value="Asia/Jakarta">Asia/Jakarta (GMT+7)</option><option value="Asia/Makassar">Asia/Makassar (GMT+8)</option><option value="Asia/Jayapura">Asia/Jayapura (GMT+9)</option><option value="Asia/Singapore">Asia/Singapore (GMT+8)</option><option value="Asia/Kuala_Lumpur">Asia/Kuala_Lumpur (GMT+8)</option></select></label><label className="text-sm font-semibold">Mata uang<select className={inputClass} value={form.currency} onChange={(event) => update("currency", event.target.value)}><option value="IDR">IDR - Rupiah</option><option value="SGD">SGD - Dolar Singapura</option><option value="MYR">MYR - Ringgit</option><option value="USD">USD - Dolar Amerika</option></select></label></div>
              <div className="flex items-start gap-3 rounded-xl border border-teal/12 bg-mint/60 p-4 text-sm text-ink/68"><Building2 size={18} className="mt-0.5 shrink-0 text-teal" /><p>Data ini menjadi identitas utama workspace dan dapat diubah kapan saja dari Pengaturan.</p></div>
              {error && <p className="text-sm font-medium text-red-600" role="alert">{error}</p>}
              <button className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-teal px-5 text-sm font-bold text-white transition hover:bg-teal/90" type="submit">Lanjut <ArrowRight size={17} /></button>
            </form> : workspaceReady ? <div className="mt-8 space-y-6">
              <p role="status" className="border-l-4 border-teal bg-mint/60 p-4 text-sm">Profil bisnis tersimpan. Outlet akan berasal dari POS/ERP; tidak ada outlet manual yang dibuat.</p>
              <ApiKeysPanel language="id" />
              <a href="/docs/api" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm font-semibold text-teal"><BookOpen size={16} />Dokumentasi API</a>
              <div className="border-t border-ink/10 pt-5"><button className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-teal px-5 py-3 text-sm font-bold text-white" onClick={() => router.push("/dashboard?onboarding=complete")}>Masuk ke dashboard <ArrowRight size={17} /></button></div>
            </div> : <form className="mt-8 space-y-5" onSubmit={finish}>
              <fieldset disabled={saving} className="space-y-5">
                <legend className="mb-4 text-lg font-semibold">Bagaimana kamu ingin mulai?</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  {([{ value: "integration", label: "Hubungkan POS/ERP", Icon: Plug }, { value: "manual", label: "Tambah outlet manual", Icon: Store }] as const).map(({ value, label, Icon }) => <label key={value} className={`flex min-h-24 cursor-pointer items-center gap-3 rounded-lg border p-4 text-sm font-semibold ${mode === value ? "border-teal bg-mint/60" : "border-ink/15"}`}><input type="radio" name="start-mode" value={value} checked={mode === value} onChange={() => { setMode(value); setError(""); }} required /><Icon size={20} className="shrink-0 text-teal" /><span>{label}</span></label>)}
                </div>
              {mode === "manual" && <div className="space-y-5">
              <div className="grid gap-5 sm:grid-cols-[1fr_0.5fr]"><label className="text-sm font-semibold">Nama outlet<input className={inputClass} value={form.outletName} onChange={(event) => update("outletName", event.target.value)} placeholder="Contoh: Kedai Senja - Senopati" required /></label><label className="text-sm font-semibold">Kode outlet<input className={inputClass} value={form.outletCode} onChange={(event) => update("outletCode", event.target.value.toUpperCase())} placeholder="SNP-01" required /></label></div>
              <label className="text-sm font-semibold">Alamat outlet<textarea className={`${inputClass} min-h-24 py-3`} value={form.address} onChange={(event) => update("address", event.target.value)} placeholder="Jalan, nomor, gedung, lantai" required /></label>
              <div className="grid gap-5 sm:grid-cols-2"><label className="text-sm font-semibold">Kota<input className={inputClass} value={form.city} onChange={(event) => update("city", event.target.value)} placeholder="Jakarta Selatan" required /></label><label className="text-sm font-semibold">Negara<select className={inputClass} value={form.country} onChange={(event) => update("country", event.target.value)}><option>Indonesia</option><option>Singapura</option><option>Malaysia</option><option>Lainnya</option></select></label></div>
              </div>}
              </fieldset>
              {error && <p className="text-sm font-medium text-red-600" role="alert">{error}</p>}
              <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-between"><button disabled={saving} className="flex h-11 items-center justify-center gap-2 rounded-lg border border-ink/12 px-5 text-sm font-semibold text-ink/65 hover:bg-ink/5" type="button" onClick={() => { setError(""); setStep(1); }}><ArrowLeft size={17} /> Kembali</button><button className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-teal px-5 py-3 text-sm font-bold text-white transition hover:bg-teal/90 disabled:opacity-60" type="submit" disabled={saving || !mode}>{saving ? "Menyimpan..." : mode === "integration" ? "Siapkan koneksi" : "Masuk ke dashboard"} {!saving && <Check size={17} />}</button></div>
              {mode === "manual" && <p className="flex items-center gap-2 text-xs text-ink/45"><MapPin size={14} /> Lokasi dapat dikelola lagi nanti.</p>}
            </form>}
          </div>
        </section>
      </div>
    </main>
  );
}

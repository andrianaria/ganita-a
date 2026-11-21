import Image from "next/image";
import Link from "next/link";
import { BrandLockup } from "../components/brand-lockup";
import { ArrowRight, BarChart3, Box, Check, FileText, LockKeyhole, UsersRound } from "lucide-react";

const features = [
  { label: "POS", icon: BarChart3 },
  { label: "Inventori", icon: Box },
  { label: "Kalkulasi resep", icon: FileText },
  { label: "Kesehatan outlet", icon: UsersRound }
];

export default function Page() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#f5f8f4] text-ink">
      <Image src="/brand/ganita-login-scene.png" alt="GANITA.ai di ruang kerja restoran" fill priority unoptimized quality={100} sizes="100vw" className="object-cover object-center" />
      <div className="absolute inset-0 bg-white/68 lg:bg-gradient-to-r lg:from-white/90 lg:via-white/72 lg:to-white/12" />
      <div className="relative mx-auto grid min-h-screen max-w-[1500px] items-center gap-12 px-6 py-10 sm:px-10 lg:grid-cols-[1fr_510px] lg:px-16 lg:py-14">
        <section className="max-w-2xl">
          <div className="flex items-center gap-3">
            <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-[#091b20] shadow-lg"><Image src="/brand/ganita-ai-headshot-transparent.png" alt="Avatar GANITA.ai" fill sizes="56px" className="object-contain" /></div>
            <BrandLockup />
          </div>
          <p className="mt-12 text-sm font-bold uppercase tracking-[0.28em] text-teal sm:mt-20">Operasional cerdas. Restoran lebih bahagia.</p>
          <h1 className="mt-5 max-w-xl text-4xl font-extrabold leading-[1.04] tracking-tight text-[#101b2a] sm:text-6xl">Satu ruang kerja untuk memahami kesehatan restoran.</h1>
          <p className="mt-6 max-w-lg text-base leading-7 text-[#42566b] sm:text-lg">Masuk untuk melihat penjualan, HPP, resep, stok, dan rekomendasi operasional dari seluruh outlet.</p>
          <div className="mt-8 flex max-w-xl flex-wrap gap-2.5">{features.map(({ label, icon: Icon }) => <span key={label} className="inline-flex items-center gap-2 rounded-full border border-teal/15 bg-white/75 px-4 py-2.5 text-sm font-semibold text-[#173045] shadow-sm backdrop-blur"><Icon size={17} className="text-teal" />{label}</span>)}</div>
          <div className="mt-12 hidden max-w-xl grid-cols-3 divide-x divide-[#bdd0cb] border-y border-[#bdd0cb] py-5 sm:grid">
            <div className="pr-5"><p className="text-2xl font-extrabold text-[#152636]">Rp 12,4 jt</p><p className="mt-1 text-xs text-[#4b6174]">Penjualan hari ini</p><p className="mt-2 text-xs font-bold text-teal">+12%</p></div>
            <div className="px-5"><p className="text-2xl font-extrabold text-[#152636]">92</p><p className="mt-1 text-xs text-[#4b6174]">Kesehatan outlet</p><p className="mt-2 text-xs font-bold text-teal">Sangat baik</p></div>
            <div className="pl-5"><p className="text-2xl font-extrabold text-[#152636]">-8%</p><p className="mt-1 text-xs text-[#4b6174]">HPP terkendali</p><p className="mt-2 text-xs font-bold text-teal">Lebih efisien</p></div>
          </div>
        </section>
        <section className="rounded-[24px] border border-white/80 bg-white/95 p-6 shadow-[0_22px_70px_rgba(24,54,46,0.2)] backdrop-blur sm:p-9">
          <div className="flex items-start gap-4"><div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-[#e3f7f3] text-teal"><LockKeyhole size={26} /></div><div><h2 className="text-2xl font-extrabold tracking-tight text-[#142238] sm:text-3xl">Masuk ke GANITA.ai</h2><p className="mt-1 text-sm leading-6 text-[#52677c]">Pilih koneksi akun untuk melanjutkan ke dashboard.</p></div></div>
          <div className="mt-8 grid gap-3"><Link href="/sign-in" className="group flex h-14 items-center justify-between rounded-xl bg-[#0b2225] px-5 text-base font-semibold text-white transition hover:bg-[#173a3b]"><span className="flex items-center gap-3"><span className="text-xl font-extrabold text-[#44c6b1]">G</span>Login dengan Google</span><ArrowRight size={20} className="text-aqua transition group-hover:translate-x-1" /></Link><Link href="/dev-login" className="group flex h-14 items-center justify-between rounded-xl border border-[#b9d6d0] bg-white px-5 text-base font-semibold text-[#18314a] transition hover:border-teal hover:bg-[#f1fbf8]"><span className="flex items-center gap-3"><span className="text-xl font-bold text-teal">+</span>Login Kuatdigital</span><ArrowRight size={20} className="text-teal transition group-hover:translate-x-1" /></Link></div>
          <div className="my-7 flex items-center gap-3 text-xs font-medium text-[#75879a]"><span className="h-px flex-1 bg-[#d7e2df]" />atau<span className="h-px flex-1 bg-[#d7e2df]" /></div>
          <p className="text-sm leading-6 text-[#53687c]">Akun demo lokal tersedia untuk tim Kuatdigital sampai koneksi Clerk production diaktifkan.</p>
          <div className="mt-7 flex items-center gap-3 rounded-xl bg-[#e4f8f4] p-4"><span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#20b99f] text-white"><Check size={19} /></span><div><p className="text-sm font-bold text-[#183d43]">Akses aman &amp; terpercaya</p><p className="mt-0.5 text-xs text-[#557276]">Data restoran Anda tetap aman bersama kami.</p></div></div>
        </section>
      </div>
    </main>
  );
}

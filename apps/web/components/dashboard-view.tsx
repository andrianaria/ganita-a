"use client";

import Image from "next/image";
import Link from "next/link";
import { LogoutButton } from "./logout-button";
import { BrandLockup } from "./brand-lockup";
import { LiveWorkspace, useDashboard } from "./live-workspace";
import { SettingsWorkspace } from "./settings-workspace";
import { OutletsWorkspace } from "./outlets-workspace";
import { CatalogWorkspace } from "./catalog-workspace";
import { IntegrationsWorkspace } from "./integrations-workspace";
import { ReportsWorkspace } from "./reports-workspace";
import { AssistantPanel } from "./assistant-panel";
import { AlertsMenu } from "./alerts-menu";
import { RestaurantScene, type SceneOutlet } from "./restaurant-scene";
import { workspace } from "../lib/workspace-client";
import { SalesImportButton } from "./sales-import-dialog";
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Bell,
  Boxes,
  Bot,
  Check,
  ChevronDown,
  CircleHelp,
  ClipboardCheck,
  Copy,
  Clock3,
  FileText,
  HeartPulse,
  History,
  LayoutDashboard,
  Lightbulb,
  KeyRound,
  Menu,
  MessageCircle,
  Map as MapIcon,
  PackageSearch,
  PanelLeftClose,
  Plus,
  Plug,
  RefreshCw,
  Settings,
  ShieldCheck,
  Sparkles,
  Store,
  TrendingUp,
  Upload,
  Utensils,
  X,
  Zap,
} from "lucide-react";

type Language = "id" | "en";
const LanguageContext = createContext<Language>("id");
const useLanguage = () => useContext(LanguageContext);
type MenuKey =
  | "dashboard"
  | "outlets"
  | "universe"
  | "health"
  | "menu"
  | "ingredients"
  | "sales"
  | "analysis"
  | "integrations"
  | "reports"
  | "settings";
type Outlet = {
  id: string;
  name: string;
  code: string;
  timezone?: string;
  score: number;
  status: string;
  sales: string;
  foodCost: string;
  opex: string;
  margin: string;
  checked: string;
};

const navItems: {
  key: MenuKey;
  id: string;
  en: string;
  icon: typeof LayoutDashboard;
}[] = [
  { key: "dashboard", id: "Dasbor", en: "Dashboard", icon: LayoutDashboard },
  { key: "outlets", id: "Outlet", en: "Outlets", icon: Store },
  { key: "universe", id: "AI Universe", en: "AI Universe", icon: Bot },
  { key: "health", id: "Pemeriksaan Kesehatan", en: "Health Check", icon: HeartPulse },
  { key: "menu", id: "Menu & Resep", en: "Menu & Recipes", icon: Utensils },
  {
    key: "ingredients",
    id: "Bahan Baku",
    en: "Ingredients",
    icon: PackageSearch,
  },
  { key: "sales", id: "Penjualan", en: "Sales", icon: TrendingUp },
  {
    key: "analysis",
    id: "Analisis & Rekomendasi",
    en: "Analysis & Recommendations",
    icon: Lightbulb,
  },
  { key: "integrations", id: "Integrasi", en: "Integrations", icon: Boxes },
  { key: "reports", id: "Laporan", en: "Reports", icon: FileText },
  { key: "settings", id: "Pengaturan", en: "Settings", icon: Settings },
];
// Synthetic examples for unfinished views; live workspaces read the configured API.
const outlets: Outlet[] = [
  {
    id: "demo-outlet-a",
    name: "Demo Outlet A",
    code: "DEMO_A",
    score: 61,
    status: "Perlu perhatian",
    sales: "Rp 12,8 jt",
    foodCost: "36,4%",
    opex: "22,1%",
    margin: "18,6%",
    checked: "12 min ago",
  },
  {
    id: "demo-outlet-b",
    name: "Demo Outlet B",
    code: "DEMO_B",
    score: 48,
    status: "Kritis",
    sales: "Rp 9,8 jt",
    foodCost: "42,6%",
    opex: "26,4%",
    margin: "11,2%",
    checked: "12 min ago",
  },
  {
    id: "demo-outlet-c",
    name: "Demo Outlet C",
    code: "DEMO_C",
    score: 82,
    status: "Sehat",
    sales: "Rp 14,2 jt",
    foodCost: "31,8%",
    opex: "18,5%",
    margin: "26,8%",
    checked: "12 min ago",
  },
  {
    id: "demo-outlet-d",
    name: "Demo Outlet D",
    code: "DEMO_D",
    score: 70,
    status: "Cukup",
    sales: "Rp 11,6 jt",
    foodCost: "37,5%",
    opex: "20,7%",
    margin: "21,5%",
    checked: "12 min ago",
  },
  {
    id: "demo-outlet-e",
    name: "Demo Outlet E",
    code: "DEMO_E",
    score: 79,
    status: "Sehat",
    sales: "Rp 10,4 jt",
    foodCost: "33,7%",
    opex: "19,2%",
    margin: "24,7%",
    checked: "12 min ago",
  },
];
const prescriptions = [
  {
    type: "Pricing",
    title: "Naikkan harga Salmon Mentai Don 8%",
    detail:
      "Harga 14% di bawah benchmark kategori sementara biaya bahan melewati target.",
    impact: "+Rp 2,4 jt / bulan",
    tone: "rose",
  },
  {
    type: "Bundling",
    title: "Buat bundling Chicken Katsu dengan Lemon Tea",
    detail:
      "Stok teh tinggi dan kombinasi ini dapat menaikkan nilai transaksi tanpa persiapan tambahan.",
    impact: "+8% estimasi nilai transaksi",
    tone: "amber",
  },
  {
    type: "Menu",
    title: "Pertimbangkan jeda Nasi Goreng Seafood di Demo Outlet B",
    detail:
      "Margin kontribusi negatif selama 2 minggu berturut-turut. Tinjau pemasok dan porsi terlebih dahulu.",
    impact: "Lindungi Rp 1,1 jt / bulan",
    tone: "slate",
  },
];

type UniverseAgent = {
  id: string;
  outletId: string;
  outletName: string;
  location: string;
  status: "working" | "ready" | "attention";
  task: string;
  progress: number;
  score: number;
  diagnosis: string;
  nextAction: string;
};

const mockUniverseAgents: UniverseAgent[] = [
  {
    id: "special-inspector-a",
    outletId: "demo-outlet-a",
    outletName: "Demo Outlet A",
    location: "Zona Barat",
    status: "working",
    task: "Memeriksa biaya bahan dan resep aktif",
    progress: 74,
    score: 61,
    diagnosis: "Harga salmon naik dan mulai menekan margin menu utama.",
    nextAction: "Tinjau ulang harga Salmon Mentai Don dan pemasok seafood.",
  },
  {
    id: "special-inspector-b",
    outletId: "demo-outlet-b",
    outletName: "Demo Outlet B",
    location: "Zona Pusat",
    status: "attention",
    task: "Menunggu konfirmasi tindakan margin negatif",
    progress: 38,
    score: 48,
    diagnosis: "Ada menu dengan margin negatif selama dua minggu.",
    nextAction: "Konfirmasi jeda menu atau ubah porsi dan harga jual.",
  },
  {
    id: "special-inspector-c",
    outletId: "demo-outlet-c",
    outletName: "Demo Outlet C",
    location: "Zona Selatan",
    status: "ready",
    task: "Siaga untuk pemeriksaan berikutnya",
    progress: 100,
    score: 82,
    diagnosis: "Operasional stabil dan biaya bahan berada dalam target.",
    nextAction: "Pertahankan pola pembelian dan pantau tren penjualan.",
  },
  {
    id: "special-inspector-city",
    outletId: "demo-outlet-d",
    outletName: "City",
    location: "Zona Timur",
    status: "working",
    task: "Membandingkan penjualan dan stok harian",
    progress: 56,
    score: 70,
    diagnosis: "Penjualan sehat, tetapi stok beberapa bahan bergerak lebih lambat.",
    nextAction: "Sesuaikan pembelian dan dorong bundling menu dengan stok tinggi.",
  },
];

export default function DashboardView({
  userName,
  timezone,
  initialOutlets,
}: {
  userName: string;
  timezone?: string;
  initialOutlets: Array<{ id: string; name: string; code: string; timezone?: string }>;
}) {
  const liveOutlets: Outlet[] = initialOutlets.length
    ? initialOutlets.map((item) => ({
        id: item.id,
        name: item.name,
        code: item.code,
        timezone: item.timezone,
        score: 0,
        status: "Belum ada data",
        sales: "Belum ada data",
        foodCost: "-",
        opex: "-",
        margin: "-",
        checked: "Baru dibuat",
      }))
    : [
        {
          id: "",
          name: "Belum ada outlet",
          code: "-",
          score: 0,
          status: "Belum ada data",
          sales: "Belum ada data",
          foodCost: "-",
          opex: "-",
          margin: "-",
          checked: "-",
        },
      ];
  const [active, setActive] = useState<MenuKey>("dashboard");
  const [language, setLanguage] = useState<Language>("id");
  const [outletSearch, setOutletSearch] = useState("");
  useEffect(() => {
    try { const saved = localStorage.getItem("ganita-language"); if (saved === "en" || saved === "id") { setLanguage(saved); document.documentElement.lang = saved; } } catch { /* Storage may be disabled. */ }
  }, []);
  const changeLanguage = (value: Language) => {
    setLanguage(value); document.documentElement.lang = value;
    try { localStorage.setItem("ganita-language", value); } catch { /* The selected language still applies in this tab. */ }
  };
  const [outletId, setOutletId] = useState(
    "",
  );
  useEffect(() => {
    if (outletId && !initialOutlets.some(outlet => outlet.id === outletId)) setOutletId("");
  }, [initialOutlets, outletId]);
  const [chatOpen, setChatOpen] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);

  const selectMenu = (key: MenuKey) => {
    setActive(key);
    setMobileMenu(false);
  };
  return (
    <LanguageContext.Provider value={language}>
      <main className="min-h-screen bg-[#f3f6f4] text-[#15302a]">
        <div className="flex min-h-screen">
          <Sidebar active={active} onSelect={selectMenu} language={language} />
          <div className={active === "universe" ? "flex h-dvh min-w-0 flex-1 flex-col" : "min-w-0 flex-1"}>
            <header className="sticky top-0 z-20 flex min-h-[76px] shrink-0 flex-wrap items-center justify-between gap-3 border-b border-[#dce7e2] bg-white/95 px-5 py-3 backdrop-blur md:px-8">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setMobileMenu(true)}
                  className="rounded p-2 text-[#53716a] hover:bg-[#eef5f1] md:hidden"
                  aria-label="Buka menu"
                >
                  <Menu size={20} />
                </button>
                <h1 className="break-words text-lg font-semibold md:text-2xl">
                  {active === "integrations"
                    ? language === "id"
                      ? "Integrasi Sistem"
                      : "System Integrations"
                    : pageTitle(active, language)}
                </h1>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex max-w-[220px] flex-col gap-1 rounded border border-[#dce7e2] bg-[#f7faf8] px-2 py-2 text-xs sm:text-sm">
                  {initialOutlets.length > 10 && <input type="search" aria-label={language === "id" ? "Cari pilihan outlet" : "Search outlet options"} placeholder={language === "id" ? "Cari nama atau kode..." : "Search name or code..."} value={outletSearch} onChange={event => setOutletSearch(event.target.value)} className="w-full min-w-0 rounded border border-[#dce7e2] bg-white px-2 py-1 text-xs" />}
                  <div className="flex min-w-0 items-center gap-2">
                  <Store size={16} className="text-[#15947d]" />
                  <select
                    aria-label={language === "id" ? "Pilih outlet" : "Select outlet"}
                    value={outletId}
                    onChange={(event) => setOutletId(event.target.value)}
                    className="min-w-0 bg-transparent font-medium outline-none"
                  >
                    <option value="">{language === "id" ? "Semua outlet" : "All outlets"}</option>
                    {liveOutlets.filter(item => item.id && (item.id === outletId || `${item.name} ${item.code}`.toLowerCase().includes(outletSearch.trim().toLowerCase()))).map((item) => (
                      <option key={item.id} value={item.id}>{item.name}</option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="text-[#7b938d]" />
                  </div>
                </div>
                <label className="flex items-center gap-1 rounded border border-[#dce7e2] bg-white px-2 py-1.5 text-xs font-semibold text-[#53716a]">
                  <span className="sr-only">Bahasa</span>
                  <select
                    aria-label="Pilih bahasa"
                    value={language}
                    onChange={(event) =>
                      changeLanguage(event.target.value as Language)
                    }
                    className="bg-transparent outline-none"
                  >
                    <option value="id">ID</option>
                    <option value="en">EN</option>
                  </select>
                </label>
                <AlertsMenu key={outletId} language={language} outletId={outletId} />
                <LogoutButton name={userName} language={language} />
              </div>
            </header>
            {mobileMenu ? (
              <MobileNav
                active={active}
                onSelect={selectMenu}
                onClose={() => setMobileMenu(false)}
                language={language}
              />
            ) : null}
            <div className={active === "universe" ? "min-h-0 w-full flex-1" : "max-w-[1500px] p-5 pb-28 md:p-8 md:pb-28"}>
              {["dashboard", "health", "sales", "analysis"].includes(active) && (
                <LiveWorkspace outletId={outletId} view={active} userName={userName} language={language} onNavigate={selectMenu} />
              )}
              {active === "universe" && <AIUniverseView outletId={outletId} />}
              {(active === "menu" || active === "ingredients") && <CatalogWorkspace language={language} outletId={outletId} view={active} />}
              {active === "integrations" && <IntegrationsWorkspace language={language} />}
              {active === "settings" && <SettingsWorkspace language={language} />}
              {active === "outlets" && <OutletsWorkspace language={language} />}
              {active === "reports" && <ReportsWorkspace key={outletId} language={language} outletId={outletId} />}
            </div>
          </div>
        </div>
        <button
          onClick={() => setChatOpen(true)}
          className={`fixed z-30 flex items-center gap-3 rounded-full bg-[#173d34] text-sm font-semibold text-white shadow-[0_10px_30px_rgba(23,61,52,0.28)] transition hover:-translate-y-0.5 ${active === "universe" ? "bottom-4 right-4 p-2 xl:bottom-6 xl:right-6 xl:px-4 xl:py-3" : active === "outlets" || active === "settings" ? "bottom-6 right-6 p-2 md:px-4 md:py-3" : "bottom-6 right-6 px-4 py-3"}`}
          aria-label="Buka Ask Ganita"
        >
          <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-[#48ddc0]">
            <Image src="/brand/ganita-ai-headshot-transparent.png" alt="" width={36} height={36} className="h-full w-full object-contain" />
          </span>
          <span className={active === "universe" ? "hidden xl:inline" : active === "outlets" || active === "settings" ? "hidden md:inline" : ""}>{language === "id" ? "Tanya Ganita" : "Ask Ganita"}</span>
        </button>
        {chatOpen ? <AssistantPanel key={outletId} language={language} outletId={outletId} onClose={() => setChatOpen(false)} /> : null}
      </main>
    </LanguageContext.Provider>
  );
}

function Sidebar({
  active,
  onSelect,
  language,
}: {
  active: MenuKey;
  onSelect: (key: MenuKey) => void;
  language: Language;
}) {
  return (
    <aside className={`hidden w-[256px] shrink-0 flex-col bg-[#173d34] text-white md:flex ${active === "universe" ? "h-dvh overflow-y-auto" : ""}`}>
      <div className="flex h-[76px] shrink-0 items-center gap-3 border-b border-white/10 px-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#48ddc0] text-[#173d34]">
          <Zap size={21} />
        </div>
        <BrandLockup inverse />
      </div>
      <div className="px-4 py-6">
        <p className="px-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/42">
          {language === "id" ? "Ruang kerja" : "Workspace"}
        </p>
        <nav className="mt-3 grid gap-1">
          {navItems.map(({ key, id, en, icon: Icon }) => (
            <button
              key={key}
              onClick={() => onSelect(key)}
              className={`flex items-center gap-3 rounded-lg px-3 py-3 text-left text-sm font-medium transition ${active === key ? "bg-[#d8fff5] text-[#173d34]" : "text-white/72 hover:bg-white/8 hover:text-white"}`}
            >
              <Icon size={18} />
              {language === "id" ? id : en}
            </button>
          ))}
        </nav>
      </div>
      <div className="mt-auto border-t border-white/10 p-4">
        <div className="rounded-xl bg-white/8 p-4">
          <div className="flex items-center gap-2 text-[#48ddc0]">
            <ShieldCheck size={17} />
            <span className="text-xs font-semibold">
              {language === "id" ? "Sumber data" : "Data sources"}
            </span>
          </div>
          <p className="mt-2 text-xs leading-5 text-white/55">
            {language === "id"
              ? "Kelola koneksi dan API key di Integrasi."
              : "Manage connections and API keys in Integrations."}
          </p>
        </div>
        <button onClick={() => onSelect("integrations")} className="mt-4 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-white/60 hover:bg-white/8 hover:text-white">
          <Plug size={17} />
          {language === "id" ? "Buka integrasi" : "Open integrations"}
        </button>
      </div>
    </aside>
  );
}

function MobileNav({
  active,
  onSelect,
  onClose,
  language,
}: {
  active: MenuKey;
  onSelect: (key: MenuKey) => void;
  onClose: () => void;
  language: Language;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-[#173d34]/35 md:hidden">
      <div className="flex h-full w-[285px] flex-col bg-[#173d34] text-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 p-5">
          <BrandLockup inverse />
          <button
            onClick={onClose}
            className="rounded p-2 text-white/70 hover:bg-white/10"
            aria-label="Tutup menu"
          >
            <X size={19} />
          </button>
        </div>
        <nav className="grid gap-1 p-4">
          {navItems.map(({ key, id, en, icon: Icon }) => (
            <button
              key={key}
              onClick={() => onSelect(key)}
              className={`flex items-center gap-3 rounded-lg px-3 py-3 text-left text-sm font-medium ${active === key ? "bg-[#d8fff5] text-[#173d34]" : "text-white/75 hover:bg-white/10 hover:text-white"}`}
            >
              <Icon size={18} />
              {language === "id" ? id : en}
            </button>
          ))}
        </nav>
        <div className="mt-auto p-4">
          <div className="rounded-xl bg-white/8 p-4 text-xs leading-5 text-white/60">
            <ShieldCheck size={17} className="mb-2 text-[#48ddc0]" />
            {language === "id"
              ? "Kelola sumber POS dan inventori melalui Integrasi."
              : "Manage POS and inventory sources in Integrations."}
          </div>
        </div>
      </div>
    </div>
  );
}

function HealthDashboard({
  outlet,
  timezone,
  userName,
  outlets,
  onOpenChat,
}: {
  outlet: Outlet;
  timezone?: string;
  userName: string;
  outlets: Outlet[];
  onOpenChat: () => void;
}) {
  const outletTimezone = (outlet.timezone ?? timezone)?.split(" ")[0];
  const dateLabel = new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    ...(outletTimezone ? { timeZone: outletTimezone } : {}),
  }).format(new Date());
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-center gap-4">
          <Image
            src="/brand/ganita-ai-avatar.png"
            alt="Avatar GANITA.ai"
            width={72}
            height={72}
            className="h-[72px] w-[72px] rounded-2xl object-cover shadow-sm"
          />
          <div>
            <p className="text-sm text-[#648078]">
              {dateLabel} · Pemeriksaan terakhir 12 menit lalu
            </p>
            <h2 className="mt-1 text-3xl font-semibold tracking-tight md:text-4xl">
              Selamat pagi, {userName}.
            </h2>
            <p className="mt-2 max-w-2xl text-[#648078]">
              Berikut ringkasan kesehatan outlet kamu. Mulai dari outlet yang
              membutuhkan perhatian.
            </p>
          </div>
        </div>
        <button
          onClick={onOpenChat}
          className="flex items-center gap-2 rounded-lg border border-[#b9ddd3] bg-white px-4 py-2.5 text-sm font-semibold text-[#157b68] shadow-sm hover:bg-[#effaf6]"
        >
          <Sparkles size={17} />
          Tanya Ganita
        </button>
      </div>
      <section className="flex flex-col gap-4 rounded-2xl border border-[#b9ddd3] bg-[#eaf8f4] p-5 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          <Image src="/brand/ganita-ai-headshot-transparent.png" alt="" width={42} height={42} className="h-10 w-10 shrink-0 object-contain" />
          <div>
            <p className="text-sm font-semibold text-[#173d34]">Langkah berikutnya bersama Ganita</p>
            <p className="mt-1 text-sm leading-6 text-[#55736b]">Hubungkan POS atau impor CSV pertama agar pemeriksaan kesehatan outlet mulai terisi.</p>
          </div>
        </div>
        <button onClick={onOpenChat} className="flex shrink-0 items-center justify-center gap-2 rounded-lg bg-[#173d34] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#24584b]"><Sparkles size={16} /> Mulai dengan Ganita</button>
      </section>
      <div className="grid gap-5 xl:grid-cols-[1.25fr_0.75fr]">
        <section className="rounded-2xl border border-[#dce7e2] bg-white p-5 shadow-[0_8px_26px_rgba(22,60,52,0.05)] md:p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-[#15947d]">
                Pemeriksaan kesehatan
              </p>
              <h3 className="mt-1 text-xl font-semibold">
                Kesehatan outlet secara keseluruhan
              </h3>
            </div>
            <span className="flex items-center gap-1.5 rounded-full bg-[#e8f8ef] px-3 py-1.5 text-xs font-semibold text-[#238854]">
              <span className="h-2 w-2 rounded-full bg-[#2fb875]" />
              Diperiksa hari ini
            </span>
          </div>
          <div className="mt-6 grid items-center gap-8 md:grid-cols-[210px_1fr]">
            <div
              className="relative mx-auto flex h-[190px] w-[190px] items-center justify-center rounded-full"
              style={{
                background:
                  "conic-gradient(#f3ba4b 0deg 172deg, #37ba88 172deg 241deg, #e8f0ed 241deg 360deg)",
              }}
            >
              <div className="flex h-[148px] w-[148px] flex-col items-center justify-center rounded-full bg-white">
                <span className="text-5xl font-semibold tracking-tight">
                  67
                </span>
                <span className="text-sm text-[#779089]">dari 100</span>
                <span className="mt-1 rounded-full bg-[#fff5db] px-2 py-0.5 text-xs font-semibold text-[#a56c13]">
                  Cukup sehat
                </span>
              </div>
            </div>
            <div>
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  {
                    label: "Profitabilitas",
                    value: "Baik",
                    score: "80",
                    tone: "good",
                  },
                  {
                    label: "Biaya bahan",
                    value: "Perlu perhatian",
                    score: "60",
                    tone: "warn",
                  },
                  {
                    label: "Momentum penjualan",
                    value: "Baik",
                    score: "82",
                    tone: "good",
                  },
                  {
                    label: "Efisiensi operasional",
                    value: "Baik",
                    score: "75",
                    tone: "good",
                  },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="rounded-xl border border-[#e4eeea] bg-[#fbfdfc] p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm text-[#55736b]">
                        {item.label}
                      </span>
                      <span
                        className={`text-sm font-semibold ${item.tone === "warn" ? "text-[#bd7b13]" : "text-[#19895c]"}`}
                      >
                        {item.value}
                      </span>
                    </div>
                    <div className="mt-3 h-2 rounded-full bg-[#e7efec]">
                      <div
                        className={`h-full rounded-full ${item.tone === "warn" ? "bg-[#f3ba4b]" : "bg-[#37ba88]"}`}
                        style={{ width: `${item.score}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-sm leading-6 text-[#648078]">
                {outlet.name} secara umum stabil, tetapi biaya bahan adalah area
                pertama yang perlu diperiksa. Ganita sudah menemukan gejala dan
                menyiapkan tindakan berikutnya.
              </p>
            </div>
          </div>
        </section>
        <section className="rounded-2xl bg-[#173d34] p-6 text-white shadow-[0_8px_26px_rgba(22,60,52,0.12)]">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-semibold text-[#48ddc0]">
                Ganita diagnosis
              </p>
              <h3 className="mt-1 text-xl font-semibold">
                Kenaikan biaya bahan
              </h3>
            </div>
            <HeartPulse className="text-[#48ddc0]" size={25} />
          </div>
          <p className="mt-5 text-sm leading-6 text-white/70">
            Perubahan harga bahan dan pergeseran porsi membuat dua outlet keluar
            dari rentang sehatnya.
          </p>
          <div className="mt-5 space-y-3">
            {[
              "Salmon price +30%",
              "Waste above 5%",
              "Biaya resep belum diperbarui",
            ].map((item) => (
              <div
                key={item}
                className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/6 p-3 text-sm"
              >
                <AlertTriangle size={16} className="shrink-0 text-[#f3ba4b]" />
                {item}
              </div>
            ))}
          </div>
          <button
            onClick={onOpenChat}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-[#48ddc0] px-4 py-3 text-sm font-semibold text-[#173d34] hover:bg-[#75edda]"
          >
            Lihat tindakan Ganita <ArrowUpRight size={16} />
          </button>
        </section>
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        <MetricCard
          label="Penjualan bersih"
          value="Rp 58,8 jt"
          change="+12%"
          icon={TrendingUp}
        />
        <MetricCard
          label="Biaya bahan"
          value="35,8%"
          change="+3,2%"
          negative
          icon={Utensils}
        />
        <MetricCard
          label="Resep terbuka"
          value="8"
          change="3 urgent"
          negative
          icon={ClipboardCheck}
        />
      </div>
      <div className="grid gap-5 xl:grid-cols-[1.25fr_0.75fr]">
        <section className="rounded-2xl border border-[#dce7e2] bg-white p-5 shadow-[0_8px_26px_rgba(22,60,52,0.05)]">
          <SectionHeading
            eyebrow="Tren pemulihan"
            title="Skor kesehatan 12 minggu terakhir"
            icon={TrendingUp}
          />
          <div className="mt-7 flex h-44 items-end gap-2 border-b border-l border-[#dce7e2] px-3 pb-0 pt-4">
            {[48, 52, 55, 51, 58, 61, 59, 65, 62, 69, 67, 74].map(
              (value, index) => (
                <div key={index} className="group flex h-full flex-1 items-end">
                  <div
                    className="relative w-full rounded-t bg-[#44c39b] transition group-hover:bg-[#15947d]"
                    style={{ height: `${value}%` }}
                  >
                    <span className="absolute -top-6 left-1/2 hidden -translate-x-1/2 text-[11px] font-semibold text-[#52726a] group-hover:block">
                      {value}
                    </span>
                  </div>
                </div>
              ),
            )}
          </div>
          <div className="mt-3 flex justify-between pl-3 text-xs text-[#8aa098]">
            <span>Jul 01</span>
            <span>Aug 01</span>
            <span>Hari ini</span>
          </div>
        </section>
        <section className="rounded-2xl border border-[#dce7e2] bg-white p-5 shadow-[0_8px_26px_rgba(22,60,52,0.05)]">
          <SectionHeading
            eyebrow="Tindakan minggu ini"
            title="Prioritas tindakan"
            icon={Lightbulb}
          />
          <div className="mt-5 space-y-3">
            {[
              {
                number: "01",
                text: "Audit biaya salmon di Demo Outlet B",
                tag: "Mendesak",
              },
              {
                number: "02",
                text: "Tinjau hasil resep untuk 3 menu",
                tag: "Hari ini",
              },
              {
                number: "03",
                text: "Sesuaikan batas stok alpukat",
                tag: "Minggu ini",
              },
            ].map((item) => (
              <div
                key={item.number}
                className="flex items-center gap-3 rounded-xl border border-[#e4eeea] p-3"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#eaf8f4] text-xs font-bold text-[#15947d]">
                  {item.number}
                </span>
                <p className="flex-1 text-sm font-medium">{item.text}</p>
                <span className="text-[11px] font-semibold text-[#9a6d20]">
                  {item.tag}
                </span>
              </div>
            ))}
          </div>
          <button
            onClick={onOpenChat}
            className="mt-4 text-sm font-semibold text-[#15947d] hover:underline"
          >
            Lihat semua resep{" "}
            <ArrowUpRight className="ml-1 inline" size={14} />
          </button>
        </section>
      </div>
      <TriageTable outlets={outlets} />
    </div>
  );
}

function HealthCheckView({
  outlet,
  onOpenChat,
}: {
  outlet: Outlet;
  onOpenChat: () => void;
}) {
  return (
    <PageFrame
      eyebrow="Diagnosa outlet"
          title="Pemeriksaan Kesehatan"
          description="Ganita menganalisis profit, biaya bahan, harga jual, efisiensi bahan, performa menu, dan risiko operasional secara otomatis."
    >
      <div className="grid gap-5 lg:grid-cols-[280px_1fr_1fr]">
        <section className="rounded-2xl border border-[#dce7e2] bg-white p-6 text-center shadow-sm">
          <p className="text-sm font-semibold text-[#15947d]">Skor kesehatan</p>
          <div
            className="mx-auto mt-5 flex h-44 w-44 items-center justify-center rounded-full"
            style={{
              background:
                "conic-gradient(#37ba88 0deg 280deg, #e8f0ed 280deg 360deg)",
            }}
          >
            <div className="flex h-32 w-32 flex-col items-center justify-center rounded-full bg-white">
              <span className="text-4xl font-semibold">{outlet.score}</span>
              <span className="text-xs text-[#779089]">/ 100</span>
              <span className="mt-1 text-sm font-semibold text-[#19895c]">
                {outlet.score > 75 ? "Sehat" : "Perlu perhatian"}
              </span>
            </div>
          </div>
          <p className="mt-5 text-sm leading-6 text-[#6c867e]">
            Outlet masih sehat, namun ada beberapa area yang perlu diperbaiki
            agar margin naik.
          </p>
        </section>
        <section className="rounded-2xl border border-[#dce7e2] bg-white p-5 shadow-sm">
          <SectionHeading
            eyebrow="Hasil diagnosa"
            title="Tanda vital"
            icon={HeartPulse}
          />
          <div className="mt-5 grid gap-2">
            {[
              "Profitabilitas",
              "Biaya bahan",
              "Harga Jual",
              "Efisiensi Bahan",
              "Performa Menu",
              "Risiko & Anomali",
            ].map((label, index) => (
              <div
                key={label}
                className="flex items-center justify-between rounded-lg border border-[#e4eeea] px-3 py-3 text-sm"
              >
                <span>{label}</span>
                <StatusPill
                  status={
                    index === 1 || index === 4 ? "Perlu perhatian" : "Baik"
                  }
                />
              </div>
            ))}
          </div>
        </section>
        <section className="rounded-2xl border border-[#dce7e2] bg-white p-5 shadow-sm">
          <SectionHeading
            eyebrow="Resep dari Ganita"
            title="Rencana tindakan"
            icon={Sparkles}
          />
          <div className="mt-5 space-y-3">
            {[
              "Naikkan harga 2 menu untuk menjaga margin hingga 8%",
              "Buat bundling menu ayam + lemon tea",
              "Pertimbangkan substitusi bahan untuk salmon",
            ].map((text) => (
              <button
                key={text}
                onClick={onOpenChat}
                className="flex w-full items-center justify-between gap-3 rounded-lg border border-[#dce7e2] p-3 text-left text-sm hover:border-[#48b99f] hover:bg-[#f2fbf8]"
              >
                {text}
                <ArrowUpRight size={15} className="shrink-0 text-[#15947d]" />
              </button>
            ))}
          </div>
        </section>
      </div>
    </PageFrame>
  );
}

function MenuRecipesView() {
  return (
    <PageFrame
      eyebrow="Kelola menu"
      title="Menu & Resep"
      description="Kelola menu, resep, HPP, margin, dan status performa setiap item secara otomatis."
      action="Tambah Menu"
    >
      <div className="mb-5 flex flex-wrap gap-2">
        <button className="rounded-lg bg-[#d9f7ef] px-4 py-2 text-sm font-semibold text-[#157b68]">
          Semua Menu (24)
        </button>
        <button className="rounded-lg border border-[#dce7e2] bg-white px-4 py-2 text-sm">
          Menu Aktif (20)
        </button>
        <button className="rounded-lg border border-[#dce7e2] bg-white px-4 py-2 text-sm">
          Perlu Perhatian (4)
        </button>
      </div>
      <section className="overflow-hidden rounded-2xl border border-[#dce7e2] bg-white shadow-sm">
        <div className="flex flex-wrap gap-3 border-b border-[#e4eeea] p-5">
          <input
            placeholder="Cari menu..."
            className="min-w-[220px] flex-1 rounded-lg border border-[#dce7e2] px-3 py-2 text-sm outline-none focus:border-[#15947d]"
          />
          <select className="rounded-lg border border-[#dce7e2] px-3 py-2 text-sm">
            <option>Kategori</option>
            <option>Menu utama</option>
            <option>Minuman</option>
          </select>
          <select className="rounded-lg border border-[#dce7e2] px-3 py-2 text-sm">
            <option>Status</option>
            <option>Sehat</option>
            <option>Perlu perhatian</option>
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="bg-[#f7faf8] text-xs uppercase tracking-wide text-[#78918a]">
              <tr>
                <th className="px-5 py-3">Nama menu</th>
                <th className="px-5 py-3">Harga jual</th>
                <th className="px-5 py-3">HPP</th>
                <th className="px-5 py-3">Margin</th>
                <th className="px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#edf2f0]">
              {[
                [
                  "Chicken Katsu Bento",
                  "Rp 45.000",
                  "Rp 18.500",
                  "59%",
                  "Sehat",
                ],
                [
                  "Beef Yakiniku Bowl",
                  "Rp 52.000",
                  "Rp 28.000",
                  "46%",
                  "Sehat",
                ],
                [
                  "Salmon Mentai Rice",
                  "Rp 55.000",
                  "Rp 42.000",
                  "24%",
                  "Perlu perhatian",
                ],
                ["Lemon Tea", "Rp 15.000", "Rp 4.000", "73%", "Sehat"],
                ["Matcha Latte", "Rp 22.000", "Rp 11.000", "50%", "Sehat"],
              ].map((row) => (
                <tr key={row[0]}>
                  <td className="px-5 py-4 font-semibold">{row[0]}</td>
                  <td className="px-5 py-4">{row[1]}</td>
                  <td className="px-5 py-4">{row[2]}</td>
                  <td className="px-5 py-4 font-semibold text-[#19895c]">
                    {row[3]}
                  </td>
                  <td className="px-5 py-4">
                    <StatusPill status={row[4]} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </PageFrame>
  );
}

function SalesView() {
  return (
    <PageFrame
      eyebrow="Performa bisnis"
      title="Penjualan"
      description="Lihat performa penjualan dan kontribusi profit setiap menu dari POS yang terhubung."
    >
      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard
          label="Total penjualan"
          value="Rp 82,5 jt"
          change="+12% dari bulan lalu"
          icon={TrendingUp}
        />
        <MetricCard
          label="Total transaksi"
          value="4.832"
          change="+8% dari bulan lalu"
          icon={BarChart3}
        />
        <MetricCard
          label="Estimasi profit"
          value="Rp 12,5 jt"
          change="+15% dari bulan lalu"
          icon={HeartPulse}
        />
        <MetricCard
          label="Rata-rata transaksi"
          value="Rp 25,6 rb"
          change="+5% dari bulan lalu"
          icon={Store}
        />
      </div>
      <section className="mt-6 grid gap-5 lg:grid-cols-[1.3fr_0.7fr]">
        <section className="rounded-2xl border border-[#dce7e2] bg-white p-5 shadow-sm">
          <SectionHeading
            eyebrow="Tren penjualan harian"
            title="Penjualan 31 hari terakhir"
            icon={TrendingUp}
          />
          <div className="mt-7 flex h-48 items-end gap-2 border-b border-l border-[#dce7e2] px-3">
            {[
              45, 62, 52, 72, 57, 76, 64, 82, 70, 88, 78, 91, 68, 84, 74, 89,
              63, 81, 73, 94,
            ].map((value, index) => (
              <div key={index} className="flex h-full flex-1 items-end">
                <div
                  className="w-full rounded-t bg-[#37ba88]"
                  style={{ height: `${value}%` }}
                />
              </div>
            ))}
          </div>
        </section>
        <section className="rounded-2xl border border-[#dce7e2] bg-white p-5 shadow-sm">
          <SectionHeading
            eyebrow="Menu terlaris"
            title="Kontribusi porsi"
            icon={BarChart3}
          />
          <div className="mt-5 space-y-4">
            {[
              ["Chicken Katsu Bento", "1.240 porsi"],
              ["Lemon Tea", "980 porsi"],
              ["Beef Yakiniku Bowl", "720 porsi"],
              ["Matcha Latte", "610 porsi"],
            ].map(([name, value], index) => (
              <div key={name}>
                <div className="flex justify-between text-sm">
                  <span className="font-medium">
                    {index + 1}. {name}
                  </span>
                  <span className="text-[#6c867e]">{value}</span>
                </div>
                <div className="mt-2 h-2 rounded-full bg-[#e8efec]">
                  <div
                    className="h-2 rounded-full bg-[#37ba88]"
                    style={{ width: `${90 - index * 15}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      </section>
      <CsvImportCard />
    </PageFrame>
  );
}

function IntegrationsView() {
  return (
    <PageFrame
      hideHeading
      eyebrow=""
      title=""
      description="Hubungkan POS, supplier, dan sistem inventory untuk mengotomatiskan data penjualan dan bahan baku masuk ke GANITA.ai."
    >
      <Link
        href="/docs/api"
        className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-[#15947d] hover:underline"
      >
        Buka dokumentasi API
        <ArrowUpRight size={16} />
      </Link>
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-2xl border border-[#dce7e2] bg-white p-5 shadow-sm">
          <SectionHeading
            eyebrow="POS System"
            title="Sumber penjualan"
            icon={Store}
          />
          <div className="mt-5 space-y-3">
            {[
              ["MokaPOS", "Terhubung"],
              ["Majoo", "Terhubung"],
              ["ESB", "Hubungkan"],
            ].map(([name, status]) => (
              <div
                key={name}
                className="flex items-center justify-between rounded-lg border border-[#e4eeea] p-4"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#eaf8f4] text-sm font-bold text-[#15947d]">
                    {name[0]}
                  </div>
                  <span className="font-semibold">{name}</span>
                </div>
                <button
                  className={`rounded-lg px-3 py-2 text-xs font-semibold ${status === "Terhubung" ? "bg-[#e9f8ef] text-[#238854]" : "border border-[#dce7e2] text-[#15947d]"}`}
                >
                  {status}
                </button>
              </div>
            ))}
          </div>
        </section>
        <section className="rounded-2xl border border-[#dce7e2] bg-white p-5 shadow-sm">
          <SectionHeading
            eyebrow="Supplier"
            title="Pemasok bahan baku"
            icon={Boxes}
          />
          <div className="mt-5 space-y-3">
            {[
              ["Astro", "Terhubung"],
              ["Segari", "Terhubung"],
              ["SayurBox", "Hubungkan"],
            ].map(([name, status]) => (
              <div
                key={name}
                className="flex items-center justify-between rounded-lg border border-[#e4eeea] p-4"
              >
                <span className="font-semibold">{name}</span>
                <button
                  className={`rounded-lg px-3 py-2 text-xs font-semibold ${status === "Terhubung" ? "bg-[#e9f8ef] text-[#238854]" : "border border-[#dce7e2] text-[#15947d]"}`}
                >
                  {status}
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>
      <ApiKeySettings />
    </PageFrame>
  );
}

function CsvImportCard() {
  return <SalesImportButton language={useLanguage()} />;
}
function OutletsView({
  onSelectOutlet,
}: {
  onSelectOutlet: (name: string) => void;
}) {
  return (
    <PageFrame
      eyebrow="Daftar outlet"
      title="Outlet"
      description="Setiap outlet memiliki profil kesehatan. Urutkan berdasarkan urgensi, performa, atau pemeriksaan terakhir."
      action="Tambah outlet"
    >
      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard
          label="Total outlet"
          value="5"
          change="Semua terhubung"
          icon={Store}
        />
        <MetricCard
          label="Sehat"
          value="2"
          change="40% dari jaringan"
          icon={HeartPulse}
        />
        <MetricCard
          label="Perlu perhatian"
          value="3"
          change="2 sinyal kritis"
          negative
          icon={AlertTriangle}
        />
      </div>
      <section className="mt-6 overflow-hidden rounded-2xl border border-[#dce7e2] bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e4eeea] p-5">
          <div>
          <h3 className="font-semibold">Daftar kesehatan outlet</h3>
            <p className="mt-1 text-sm text-[#6c867e]">
              Terakhir diperiksa hari ini pukul 09:42 WIB
            </p>
          </div>
          <button className="flex items-center gap-2 rounded-lg border border-[#dce7e2] px-3 py-2 text-sm text-[#56736b]">
            <CircleHelp size={15} />
            How scores work
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="bg-[#f7faf8] text-xs uppercase tracking-wide text-[#78918a]">
              <tr>
                {[
                  "Outlet",
                  "Skor kesehatan",
                  "Penjualan",
                  "Biaya bahan",
                  "Margin",
                  "Status",
                  "Pemeriksaan terakhir",
                ].map((head) => (
                  <th key={head} className="px-5 py-3 font-semibold">
                    {head}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#edf2f0]">
              {outlets.map((item) => (
                <tr key={item.name} className="hover:bg-[#fbfdfc]">
                  <td className="px-5 py-4">
                    <button
                      onClick={() => onSelectOutlet(item.name)}
                      className="flex items-center gap-3 text-left"
                    >
                      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#e9f7f3] text-xs font-bold text-[#15947d]">
                        {item.code}
                      </span>
                      <span>
                        <span className="block font-semibold text-[#1c3932]">
                          {item.name}
                        </span>
                        <span className="block text-xs text-[#7d968e]">
                          Buka profil outlet
                        </span>
                      </span>
                    </button>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <span className="text-lg font-semibold">
                        {item.score}
                      </span>
                      <div className="h-2 w-20 rounded-full bg-[#e8efec]">
                        <div
                          className={`h-2 rounded-full ${scoreTone(item.score)}`}
                          style={{ width: `${item.score}%` }}
                        />
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4 font-medium">{item.sales}</td>
                  <td className="px-5 py-4">{item.foodCost}</td>
                  <td className="px-5 py-4">{item.margin}</td>
                  <td className="px-5 py-4">
                    <StatusPill status={item.status} />
                  </td>
                  <td className="px-5 py-4 text-[#718b83]">{item.checked}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </PageFrame>
  );
}

function HistoryView() {
  return (
    <PageFrame
      eyebrow="Rekam kesehatan bisnis"
      title="Riwayat Diagnosis"
      description="Lihat temuan Ganita, perubahan yang terjadi, dan hasil dari setiap tindakan pada outlet."
    >
      <section className="rounded-2xl border border-[#dce7e2] bg-white p-5 shadow-sm md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
          <h3 className="font-semibold">Linimasa diagnosis</h3>
            <p className="mt-1 text-sm text-[#6c867e]">
              Demo Outlet A · All events
            </p>
          </div>
          <button className="flex items-center gap-2 rounded-lg border border-[#dce7e2] px-3 py-2 text-sm">
            <History size={15} />
            Filter timeline
          </button>
        </div>
        <div className="mt-7 space-y-0">
          {[
            {
              date: "Hari ini, 09:42",
              title: "Kenaikan biaya bahan terdeteksi",
              detail:
                "Harga salmon dan alpukat naik di atas baseline resep.",
              tag: "Diagnosis baru",
              tone: "rose",
            },
            {
              date: "Sep 10, 14:20",
              title: "Tindakan dimulai: perbarui resep",
              detail:
                "12 versi resep diperbarui dengan harga pembelian terbaru.",
              tag: "Sedang berjalan",
              tone: "amber",
            },
            {
              date: "Sep 06, 08:50",
              title: "Waste trend improved",
              detail:
                "Waste reduced from 7.2% to 4.8% after par-level adjustment.",
              tag: "Pulih",
              tone: "green",
            },
            {
              date: "Sep 01, 10:15",
              title: "Pemeriksaan outlet selesai",
              detail:
                "Skor kesehatan naik dari 55 menjadi 61 setelah jadwal tim ditinjau.",
              tag: "Selesai",
              tone: "green",
            },
          ].map((item, index) => (
            <div
              key={item.title}
              className="relative flex gap-4 pb-8 last:pb-0"
            >
              <div className="relative flex w-8 justify-center">
                <span
                  className={`z-10 flex h-8 w-8 items-center justify-center rounded-full ${item.tone === "rose" ? "bg-[#fff0ed] text-[#db6f54]" : item.tone === "amber" ? "bg-[#fff7e2] text-[#b87916]" : "bg-[#e9f8ef] text-[#238c5c]"}`}
                >
                  {item.tone === "green" ? (
                    <Check size={16} />
                  ) : item.tone === "rose" ? (
                    <AlertTriangle size={16} />
                  ) : (
                    <Clock3 size={16} />
                  )}
                </span>
                {index < 3 ? (
                  <span className="absolute top-8 h-full w-px bg-[#dce7e2]" />
                ) : null}
              </div>
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-3">
                  <p className="font-semibold">{item.title}</p>
                  <span className="rounded-full bg-[#f3f7f5] px-2 py-1 text-[11px] font-semibold text-[#69837b]">
                    {item.tag}
                  </span>
                </div>
                <p className="mt-1 text-sm leading-6 text-[#6c867e]">
                  {item.detail}
                </p>
                <p className="mt-2 text-xs font-medium text-[#99aaa4]">
                  {item.date}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </PageFrame>
  );
}

function PrescriptionsView({ onOpenChat }: { onOpenChat: () => void }) {
  return (
    <PageFrame
      eyebrow="Rencana tindakan"
      title="Resep AI"
      description="Rekomendasi yang dapat dijalankan, lengkap dengan estimasi dampak, penanggung jawab, dan status."
      action="Buat resep"
    >
      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard
          label="Resep terbuka"
          value="8"
          change="3 mendesak"
          negative
          icon={ClipboardCheck}
        />
        <MetricCard
          label="Potensi tambahan"
          value="Rp 9,7 jt"
          change="Per bulan"
          icon={TrendingUp}
        />
        <MetricCard
          label="Pemulihan bulan ini"
          value="Rp 4,2 jt"
          change="+18% vs Agustus"
          icon={HeartPulse}
        />
      </div>
      <section className="mt-6 grid gap-4">
        {prescriptions.map((item) => (
          <div
            key={item.title}
            className="flex flex-col gap-5 rounded-2xl border border-[#dce7e2] bg-white p-5 shadow-sm md:flex-row md:items-center"
          >
            <div
              className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${item.tone === "rose" ? "bg-[#fff0ed] text-[#dd765d]" : item.tone === "amber" ? "bg-[#fff7df] text-[#bd7b13]" : "bg-[#edf2f3] text-[#55737a]"}`}
            >
              {item.type === "Pricing" ? (
                <ArrowUpRight size={22} />
              ) : item.type === "Bundling" ? (
                <Plus size={22} />
              ) : (
                <Zap size={22} />
              )}
            </div>
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-[0.14em] text-[#15947d]">
                  {item.type}
                </span>
                <span className="text-xs text-[#91a49e]">· Demo Outlet A</span>
              </div>
              <h3 className="mt-1 text-lg font-semibold">{item.title}</h3>
              <p className="mt-1 text-sm leading-6 text-[#6c867e]">
                {item.detail}
              </p>
            </div>
            <div className="md:w-44">
              <p className="text-xs uppercase tracking-wide text-[#8ba098]">
                Estimasi dampak
              </p>
              <p className="mt-1 font-semibold text-[#19895c]">{item.impact}</p>
              <button
                onClick={onOpenChat}
                className="mt-3 text-sm font-semibold text-[#15947d] hover:underline"
              >
                Tinjau tindakan{" "}
                <ArrowUpRight className="ml-1 inline" size={14} />
              </button>
            </div>
          </div>
        ))}
      </section>
    </PageFrame>
  );
}

function InventoryView() {
  return (
    <PageFrame
      eyebrow="Kesehatan bahan"
      title="Risiko Inventori"
      description="Temukan bahan yang dapat menyebabkan kehabisan stok, kebocoran margin, atau modal tertahan."
      action="Tambah pencatatan stok"
    >
      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard
          label="Berisiko"
          value="12 items"
          change="4 urgent"
          negative
          icon={AlertTriangle}
        />
        <MetricCard
          label="Risiko kehabisan stok"
          value="5 items"
          change="Next 7 days"
          negative
          icon={PackageSearch}
        />
        <MetricCard
          label="Stok mati"
          value="Rp 3,4 jt"
          change="15 items"
          icon={Boxes}
        />
        <MetricCard
          label="Lonjakan harga"
          value="7 items"
          change="vs pembelian terakhir"
          negative
          icon={TrendingUp}
        />
      </div>
      <section className="mt-6 overflow-hidden rounded-2xl border border-[#dce7e2] bg-white shadow-sm">
        <div className="border-b border-[#e4eeea] p-5">
          <h3 className="font-semibold">Bahan yang perlu diperhatikan</h3>
          <p className="mt-1 text-sm text-[#6c867e]">
            Risiko dihitung dari cakupan stok, perubahan harga, ketergantungan
            resep, dan tanggal kedaluwarsa.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-[#f7faf8] text-xs uppercase tracking-wide text-[#78918a]">
              <tr>
                <th className="px-5 py-3">Bahan</th>
                <th className="px-5 py-3">Risiko</th>
                <th className="px-5 py-3">Harga terbaru</th>
                <th className="px-5 py-3">Cakupan stok</th>
                <th className="px-5 py-3">Menu terdampak</th>
                <th className="px-5 py-3">Tindakan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#edf2f0]">
              {[
                {
                  name: "Salmon",
                  cat: "Seafood",
                  risk: "Lonjakan harga",
                  price: "Rp 280.000/kg",
                  cover: "2 days",
                  menus: "6 menus",
                },
                {
                  name: "Avocado",
                  cat: "Produce",
                  risk: "Risiko kehabisan stok",
                  price: "Rp 52.000/kg",
                  cover: "3 days",
                  menus: "8 menus",
                },
                {
                  name: "Chicken breast",
                  cat: "Protein",
                  risk: "Stok berlebih",
                  price: "Rp 38.000/kg",
                  cover: "18 days",
                  menus: "4 menus",
                },
                {
                  name: "Sauce teriyaki",
                  cat: "Condiment",
                  risk: "Mendekati kedaluwarsa",
                  price: "Rp 48.000/l",
                  cover: "11 days",
                  menus: "3 menus",
                },
              ].map((item) => (
                <tr key={item.name}>
                  <td className="px-5 py-4">
                    <p className="font-semibold">{item.name}</p>
                    <p className="text-xs text-[#829991]">{item.cat}</p>
                  </td>
                  <td className="px-5 py-4">
                    <StatusPill status={item.risk} />
                  </td>
                  <td className="px-5 py-4 font-medium">{item.price}</td>
                  <td className="px-5 py-4">{item.cover}</td>
                  <td className="px-5 py-4">{item.menus}</td>
                  <td className="px-5 py-4">
                    <button className="text-sm font-semibold text-[#15947d] hover:underline">
                      Tinjau
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </PageFrame>
  );
}

function ReportsView() {
  return (
    <PageFrame
      eyebrow="Pemeriksaan formal"
      title="Laporan"
      description="Ubah pemeriksaan kesehatan menjadi laporan mingguan dan bulanan yang jelas untuk tim manajemen."
      action="Buat laporan"
    >
      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard
          label="Laba bersih terbaru"
          value="Rp 12,48 jt"
          change="+15% vs bulan lalu"
          icon={TrendingUp}
        />
        <MetricCard
          label="Margin bersih"
          value="25,6%"
          change="+5% vs bulan lalu"
          icon={BarChart3}
        />
        <MetricCard
          label="Biaya bahan"
          value="32,4%"
          change="-3% vs bulan lalu"
          icon={Utensils}
        />
      </div>
      <section className="mt-6 grid gap-4 lg:grid-cols-2">
        <ReportCard
          title="Laporan Kesehatan Outlet Mingguan"
          detail="Skor kesehatan, indikator utama, diagnosis, dan tindakan prioritas."
          date="Minggu ke-37 · Diperbarui hari ini"
        />
        <ReportCard
          title="Laporan Manajemen Bulanan"
          detail="Ringkasan laba rugi, biaya bahan, perubahan margin, dan progres pemulihan."
          date="Agustus 2026 · Siap"
        />
        <ReportCard
          title="Laporan Biaya Bahan & Resep"
          detail="Margin resep, perubahan harga bahan, dan kontribusi menu."
          date="Agustus 2026 · Siap"
        />
        <ReportCard
          title="Laporan Risiko Inventori"
          detail="Cakupan stok, stok mati, risiko kedaluwarsa, dan selisih pembelian."
          date="Minggu ke-37 · Diperbarui hari ini"
        />
      </section>
    </PageFrame>
  );
}

function SettingsView({ outlets }: { outlets: Outlet[] }) {
  const [activeSection, setActiveSection] = useState("Perusahaan & outlet");
  const [saved, setSaved] = useState(false);
  const [profile, setProfile] = useState({ name: "", businessType: "Restoran", timezone: "Asia/Jakarta", currency: "IDR" });
  const [targets, setTargets] = useState({ foodCost: "32", margin: "24", waste: "5", stockDays: "4" });
  const [notifications, setNotifications] = useState({ health: true, stock: true, sales: false });
  const sections = ["Target kesehatan", "Tim & peran", "Aturan notifikasi"];
  useEffect(() => {
    void fetch("/api/settings", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) return;
      const result = (await response.json()) as { data?: { name?: string; businessType?: string | null; timezone?: string; currency?: string; settings?: { targets?: typeof targets; notifications?: typeof notifications } } };
      const organization = result.data;
      if (!organization) return;
      setProfile({ name: organization.name ?? "", businessType: organization.businessType ?? "Restoran", timezone: organization.timezone ?? "Asia/Jakarta", currency: organization.currency ?? "IDR" });
      if (organization.settings?.targets) setTargets({ ...targets, ...organization.settings.targets });
      if (organization.settings?.notifications) setNotifications({ ...notifications, ...organization.settings.notifications });
    });
  }, []);
  const save = async (section: "profile" | "targets" | "notifications") => {
    const body = section === "profile" ? { name: profile.name, businessType: profile.businessType, timezone: profile.timezone, currency: profile.currency } : { settings: { [section]: section === "targets" ? targets : notifications } };
    const response = await fetch("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!response.ok) return;
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2400);
  };
  return (
    <PageFrame
      eyebrow="Pusat kendali"
      title="Pengaturan"
      description="Atur parameter operasional yang digunakan Ganita untuk memantau jaringan restoran kamu."
    >
      <div className="grid gap-5 lg:grid-cols-[220px_1fr]">
        <div className="rounded-2xl border border-[#dce7e2] bg-white p-3 shadow-sm">
          <button onClick={() => setActiveSection("Perusahaan & outlet")} className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm font-semibold ${activeSection === "Perusahaan & outlet" ? "bg-[#eaf8f4] text-[#157b68]" : "text-[#68827a] hover:bg-[#f5f9f7]"}`}>
            <Store size={17} />
            Perusahaan & outlet
          </button>
          {sections.map((item) => (
            <button
              key={item}
              onClick={() => setActiveSection(item)}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm ${activeSection === item ? "bg-[#eaf8f4] font-semibold text-[#157b68]" : "text-[#68827a] hover:bg-[#f5f9f7]"}`}
            >
              <Settings size={17} />
              {item}
            </button>
          ))}
        </div>
        <section className="rounded-2xl border border-[#dce7e2] bg-white p-5 shadow-sm md:p-6">
          {activeSection === "Perusahaan & outlet" ? (
            <div className="space-y-7">
              <div className="flex items-start justify-between gap-4 border-b border-[#e4eeea] pb-5">
                <div><h3 className="font-semibold">Profil perusahaan</h3><p className="mt-1 text-sm text-[#6c867e]">Informasi ini dipakai untuk identitas workspace dan laporan manajemen.</p></div>
                <button onClick={() => void save("profile")} className="rounded-lg bg-[#173d34] px-4 py-2 text-sm font-semibold text-white">Simpan perubahan</button>
              </div>
              <div className="grid gap-5 md:grid-cols-2">
                <label className="grid gap-2 text-sm font-semibold">Nama perusahaan<input value={profile.name} onChange={(event) => setProfile({ ...profile, name: event.target.value })} placeholder="Nama perusahaan" className="rounded-lg border border-[#dce7e2] bg-[#fbfdfc] px-3 py-3 font-normal outline-none focus:border-[#15947d]" /></label>
                <label className="grid gap-2 text-sm font-semibold">Mata uang<select value={profile.currency} onChange={(event) => setProfile({ ...profile, currency: event.target.value })} className="rounded-lg border border-[#dce7e2] bg-[#fbfdfc] px-3 py-3 font-normal outline-none focus:border-[#15947d]"><option value="IDR">IDR - Rupiah Indonesia</option><option value="SGD">SGD - Dolar Singapura</option><option value="MYR">MYR - Ringgit</option><option value="USD">USD - Dolar Amerika</option></select></label>
                <label className="grid gap-2 text-sm font-semibold">Zona waktu<select value={profile.timezone} onChange={(event) => setProfile({ ...profile, timezone: event.target.value })} className="rounded-lg border border-[#dce7e2] bg-[#fbfdfc] px-3 py-3 font-normal outline-none focus:border-[#15947d]"><option>Asia/Jakarta</option><option>Asia/Makassar</option><option>Asia/Jayapura</option></select></label>
                <label className="grid gap-2 text-sm font-semibold">Jenis bisnis<select value={profile.businessType} onChange={(event) => setProfile({ ...profile, businessType: event.target.value })} className="rounded-lg border border-[#dce7e2] bg-[#fbfdfc] px-3 py-3 font-normal outline-none focus:border-[#15947d]"><option>Restoran</option><option>Kafe</option><option>Toko roti</option><option>Pujasera</option><option>Jaringan multi-brand</option></select></label>
              </div>
              <div><div className="flex items-center justify-between"><div><h3 className="font-semibold">Outlet terdaftar</h3><p className="mt-1 text-sm text-[#6c867e]">Kelola outlet dan zona waktu yang digunakan untuk laporan harian.</p></div><button className="rounded-lg border border-[#b9d6d0] px-3 py-2 text-sm font-semibold text-[#157b68]">+ Tambah outlet</button></div><div className="mt-4 divide-y divide-[#e4eeea] rounded-xl border border-[#e4eeea]">{outlets.filter((item) => item.id).map((outlet) => <div key={outlet.id} className="flex items-center justify-between gap-4 p-4"><div><p className="font-semibold">{outlet.name}</p><p className="mt-1 text-xs text-[#78918a]">Kode {outlet.code} · {outlet.timezone ?? "Asia/Jakarta"}</p></div><span className="rounded-full bg-[#e8f8f1] px-3 py-1 text-xs font-semibold text-[#19895c]">Aktif</span></div>)}{!outlets.some((item) => item.id) ? <p className="p-4 text-sm text-[#78918a]">Belum ada outlet. Tambahkan outlet pertama untuk mulai memantau kesehatan bisnis.</p> : null}</div></div>
              {saved ? <p className="rounded-lg bg-[#e8f8f1] p-3 text-sm font-semibold text-[#19895c]">Perubahan tersimpan untuk workspace ini.</p> : null}
            </div>
          ) : activeSection === "Target kesehatan" ? (
            <div>
              <div className="flex items-start justify-between gap-4 border-b border-[#e4eeea] pb-5"><div><h3 className="font-semibold">Target kesehatan</h3><p className="mt-1 text-sm text-[#6c867e]">Ambang batas ini menentukan kondisi yang akan ditandai Ganita.</p></div><button onClick={() => void save("targets")} className="rounded-lg bg-[#173d34] px-4 py-2 text-sm font-semibold text-white">Simpan perubahan</button></div>
              <div className="mt-6 grid gap-5 md:grid-cols-2">{[["Target biaya bahan", "foodCost", "Sehat jika di bawah ambang ini", "%"], ["Target margin bersih", "margin", "Sehat jika di atas ambang ini", "%"], ["Peringatan waste", "waste", "Tandai jika waste melebihi batas ini", "%"], ["Cakupan stok minimum", "stockDays", "Tandai bahan di bawah batas ini", "hari"]].map(([label, key, hint, suffix]) => <label key={key} className="grid gap-2 text-sm font-semibold">{label}<div className="flex items-center rounded-lg border border-[#dce7e2] bg-[#fbfdfc] focus-within:border-[#15947d]"><input value={targets[key as keyof typeof targets]} onChange={(event) => setTargets({ ...targets, [key]: event.target.value })} className="min-w-0 flex-1 bg-transparent px-3 py-3 font-normal outline-none" inputMode="decimal" /><span className="pr-3 text-sm font-normal text-[#78918a]">{suffix}</span></div><span className="text-xs font-normal text-[#839a92]">{hint}</span></label>)}</div>{saved ? <p className="mt-5 rounded-lg bg-[#e8f8f1] p-3 text-sm font-semibold text-[#19895c]">Target kesehatan tersimpan.</p> : null}
            </div>
          ) : activeSection === "Tim & peran" ? (
            <div><h3 className="font-semibold">Tim & peran</h3><p className="mt-1 text-sm text-[#6c867e]">Atur siapa yang dapat melihat data, mengelola integrasi, dan menjalankan tindakan Ganita.</p><div className="mt-6 divide-y divide-[#e4eeea] rounded-xl border border-[#e4eeea]"><div className="flex items-center justify-between p-4"><div><p className="font-semibold">Pemilik workspace</p><p className="mt-1 text-sm text-[#78918a]">Akses penuh ke data, outlet, dan integrasi.</p></div><span className="rounded-full bg-[#e8f8f1] px-3 py-1 text-xs font-semibold text-[#19895c]">Owner</span></div><div className="flex items-center justify-between p-4"><div><p className="font-semibold">Undang anggota tim</p><p className="mt-1 text-sm text-[#78918a]">Tambahkan manager outlet atau finance ke workspace.</p></div><button className="rounded-lg border border-[#b9d6d0] px-3 py-2 text-sm font-semibold text-[#157b68]">+ Undang anggota</button></div></div></div>
          ) : (
            <div><h3 className="font-semibold">Aturan notifikasi</h3><p className="mt-1 text-sm text-[#6c867e]">Pilih kondisi yang perlu dikirim ke pemilik dan manager outlet.</p><div className="mt-6 space-y-3">{[["health", "Skor kesehatan turun", "Beri tahu saat skor outlet turun di bawah target."], ["stock", "Risiko stok kritis", "Beri tahu saat bahan berisiko habis atau kedaluwarsa."], ["sales", "Perubahan penjualan", "Beri tahu saat penjualan berubah signifikan dari pola normal."]].map(([key, title, detail]) => <label key={key} className="flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-[#e4eeea] p-4"><span><span className="block font-semibold">{title}</span><span className="mt-1 block text-sm text-[#78918a]">{detail}</span></span><input type="checkbox" checked={notifications[key as keyof typeof notifications]} onChange={(event) => setNotifications({ ...notifications, [key]: event.target.checked })} className="mt-1 h-4 w-4 accent-[#15947d]" /></label>)}</div><button onClick={() => void save("notifications")} className="mt-6 rounded-lg bg-[#173d34] px-4 py-2 text-sm font-semibold text-white">Simpan aturan</button>{saved ? <p className="mt-4 rounded-lg bg-[#e8f8f1] p-3 text-sm font-semibold text-[#19895c]">Aturan notifikasi tersimpan.</p> : null}</div>
          )}
        </section>
      </div>
    </PageFrame>
  );
}

function TriageTable({ outlets }: { outlets: Outlet[] }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-[#dce7e2] bg-white shadow-[0_8px_26px_rgba(22,60,52,0.05)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e4eeea] p-5">
        <div>
          <p className="text-sm font-semibold text-[#15947d]">Antrean prioritas</p>
          <h3 className="mt-1 text-xl font-semibold">
            Outlets to look at first
          </h3>
        </div>
        <button className="flex items-center gap-2 rounded-lg border border-[#dce7e2] px-3 py-2 text-sm font-semibold text-[#58766d]">
          View all outlets <ArrowUpRight size={15} />
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-[#f7faf8] text-xs uppercase tracking-wide text-[#78918a]">
            <tr>
              <th className="px-5 py-3">Outlet</th>
              <th className="px-5 py-3">Skor kesehatan</th>
              <th className="px-5 py-3">Gejala utama</th>
              <th className="px-5 py-3">Biaya bahan</th>
              <th className="px-5 py-3">Tindakan berikutnya</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#edf2f0]">
            {outlets.slice(0, 4).map((item) => (
              <tr key={item.name}>
                <td className="px-5 py-4 font-semibold">{item.name}</td>
                <td className="px-5 py-4">
                  <span
                    className={`font-semibold ${item.score < 60 ? "text-[#d86f55]" : item.score < 75 ? "text-[#b77c1a]" : "text-[#19895c]"}`}
                  >
                    {item.score}/100
                  </span>
                </td>
                <td className="px-5 py-4 text-[#627d74]">
                  {item.score < 60
                    ? "Kebocoran margin"
                    : item.score < 75
                      ? "Biaya bahan bergeser"
                      : "Operasional stabil"}
                </td>
                <td className="px-5 py-4">{item.foodCost}</td>
                <td className="px-5 py-4 text-[#15947d]">
                  {item.score < 60
                    ? "Audit biaya resep"
                    : "Tinjau tren mingguan"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ApiKeySettings() {
  const [keys, setKeys] = useState<Array<{ id: string; name: string; keyPrefix: string; scopes: string[]; revokedAt?: string | null }>>([]);
  const [name, setName] = useState("Partner POS");
  const [newSecret, setNewSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const loadKeys = async () => {
    const response = await fetch("/api/integrations/api-keys", { cache: "no-store" });
    if (response.ok) {
      const result = (await response.json()) as { data?: typeof keys };
      setKeys(result.data ?? []);
    }
  };

  useEffect(() => {
    void loadKeys();
  }, []);

  const generate = async () => {
    setBusy(true);
    setMessage("");
    const response = await fetch("/api/integrations/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, scopes: ["master:write", "sales:write", "inventory:write"] }),
    });
    const result = (await response.json()) as { data?: { secret?: string }; error?: { message?: string } };
    setBusy(false);
    if (!response.ok) return setMessage(result.error?.message ?? "API key belum dapat dibuat.");
    setNewSecret(result.data?.secret ?? "");
    setMessage("API key dibuat. Salin sekarang karena secret lengkap tidak akan ditampilkan lagi.");
    void loadKeys();
  };

  const revoke = async (id: string) => {
    await fetch(`/api/integrations/api-keys/${id}/revoke`, { method: "POST" });
    void loadKeys();
  };

  return (
    <section className="rounded-2xl border border-[#dce7e2] bg-white p-5 shadow-sm md:p-6 lg:col-start-2">
      <div className="flex items-start gap-3 border-b border-[#e4eeea] pb-5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#e8f8f5] text-[#15947d]"><KeyRound size={19} /></div>
        <div><h3 className="font-semibold">API key integrasi</h3><p className="mt-1 text-sm text-[#6c867e]">Buat akses aman untuk POS atau ERP partner ke data Ganita.</p></div>
      </div>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <input value={name} onChange={(event) => setName(event.target.value)} className="min-w-0 flex-1 rounded-lg border border-[#dce7e2] px-3 py-2.5 text-sm outline-none focus:border-[#15947d]" placeholder="Nama koneksi" aria-label="Nama API key" />
        <button onClick={() => void generate()} disabled={busy || !name.trim()} className="flex items-center justify-center gap-2 rounded-lg bg-[#173d34] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"><Plus size={16} /> {busy ? "Membuat..." : "Generate key"}</button>
      </div>
      {message ? <p className="mt-3 rounded-lg bg-[#fff8e6] p-3 text-xs leading-5 text-[#876218]" role="status">{message}</p> : null}
      {newSecret ? <div className="mt-3 flex items-center gap-2 rounded-lg border border-[#b9ddd3] bg-[#f2fbf8] p-3"><code className="min-w-0 flex-1 break-all text-xs text-[#173d34]">{newSecret}</code><button onClick={() => void navigator.clipboard.writeText(newSecret)} className="shrink-0 rounded p-2 text-[#15947d] hover:bg-white" aria-label="Salin API key" title="Salin API key"><Copy size={16} /></button></div> : null}
      <div className="mt-5 space-y-2">
        {keys.length ? keys.map((item) => <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg border border-[#e4eeea] p-3 text-sm"><div className="min-w-0"><p className="truncate font-semibold">{item.name}</p><code className="text-xs text-[#78918a]">{item.keyPrefix}...</code></div>{item.revokedAt ? <span className="text-xs text-[#b65e4a]">Dicabut</span> : <button onClick={() => void revoke(item.id)} className="text-xs font-semibold text-[#b65e4a] hover:underline">Cabut akses</button>}</div>) : <p className="text-sm text-[#839a92]">Belum ada API key untuk workspace ini.</p>}
      </div>
    </section>
  );
}

function ChatPanel({ onClose }: { onClose: () => void }) {
  const language = useLanguage();
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);
  return (
    <div className="fixed bottom-24 right-6 z-40 w-[min(390px,calc(100vw-3rem))] overflow-hidden rounded-2xl border border-[#c8e4dc] bg-white shadow-[0_20px_60px_rgba(22,60,52,0.22)]">
      <div className="flex items-center justify-between bg-[#173d34] p-4 text-white">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-[#48ddc0]"><Image src="/brand/ganita-ai-headshot-transparent.png" alt="" width={36} height={36} className="h-full w-full object-contain" /></div>
          <div>
            <p className="font-semibold">Ask Ganita</p>
            <p className="text-xs text-white/60">
              {language === "id"
                ? "Partner kesehatan outlet kamu"
              : "Your outlet health partner"}
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="rounded p-1 text-white/60 hover:bg-white/10 hover:text-white"
          aria-label="Tutup chat"
        >
          <X size={18} />
        </button>
      </div>
      <div className="max-h-[430px] space-y-4 overflow-y-auto p-4">
        <div className="flex gap-3">
          <Image
            src="/brand/ganita-ai-avatar.png"
            alt="Avatar GANITA.ai"
            width={38}
            height={38}
            className="h-9 w-9 rounded-full object-cover"
          />
          <div className="rounded-2xl rounded-tl-sm bg-[#eef8f5] p-3 text-sm leading-6 text-[#38584f]">
            {language === "id"
              ? "Hai. Aku bisa menjelaskan gejala, akar masalah, atau mensimulasikan tindakan. Apa yang ingin kita periksa?"
              : "Hi. I can explain symptoms, root causes, or simulate a treatment. What should we inspect?"}
          </div>
        </div>
        {sent ? (
          <div className="ml-10 rounded-2xl rounded-tr-sm bg-[#173d34] p-3 text-sm leading-6 text-white">
            I&apos;ll prepare an analysis for: <strong>{message}</strong>. The
            connected health engine will return the root cause and estimated
            impact here.
          </div>
        ) : null}
        <div className="grid gap-2">
          {[
            language === "id"
              ? "Kenapa food cost outlet naik?"
              : "Mengapa biaya bahan outlet ini naik?",
            language === "id"
              ? "Apa 3 tindakan paling urgent?"
              : "What are my 3 urgent actions?",
            language === "id"
              ? "Apa dampaknya jika harga salmon naik Rp 3.000?"
              : "Apa dampaknya jika harga salmon naik Rp 3.000?",
          ].map((prompt) => (
            <button
              key={prompt}
              onClick={() => {
                setMessage(prompt);
                setSent(true);
              }}
              className="rounded-lg border border-[#dce7e2] px-3 py-2 text-left text-xs font-medium text-[#4d7066] hover:border-[#48b99f] hover:bg-[#f2fbf8]"
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (message.trim()) setSent(true);
        }}
        className="flex gap-2 border-t border-[#e4eeea] p-3"
      >
        <input
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder={
            language === "id"
              ? "Tanya tentang outlet kamu..."
              : "Tanya tentang outlet kamu..."
          }
          className="min-w-0 flex-1 rounded-lg border border-[#dce7e2] px-3 py-2 text-sm outline-none focus:border-[#15947d]"
        />
        <button
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#173d34] text-[#48ddc0]"
          aria-label="Kirim pertanyaan"
        >
          <ArrowUpRight size={17} />
        </button>
      </form>
    </div>
  );
}


function AIUniverseView({ outletId }: { outletId: string }) {
  const language = useLanguage();
  const t = (id: string, en: string) => language === "id" ? id : en;
  const [inspectionBusy, setInspectionBusy] = useState(false), [inspectionMessage, setInspectionMessage] = useState("");
  const { data, loading, error, refresh } = useDashboard(outletId);
  const [selectedId, setSelectedId] = useState("");
  const agents = useMemo<SceneOutlet[]>(() => (data?.outlets ?? []).map(o => ({ id: o.id, outletName: o.name, score: o.score, status: o.score !== null && o.score < 78 ? "attention" : "ready" })), [data]);
  const selected = data?.outlets.find(o => o.id === selectedId) ?? data?.outlets[0];
  if (loading) return <p role="status">{t("Memuat outlet...", "Loading outlets...")}</p>;
  if (error) return <p role="alert">{error}</p>;
  if (!selected) return <p>{t("Belum ada outlet. Hubungkan POS/ERP di Integrasi atau tambahkan outlet melalui menu Outlet.", "No outlets yet. Connect a POS/ERP in Integrations or add an outlet in Outlets.")}</p>;
  return <div className="flex h-full min-h-[480px] flex-col bg-[#c9dfdf] xl:flex-row">
    <RestaurantScene agents={agents} selectedId={selected.id} onSelect={setSelectedId} language={language} />
    <section aria-label={t("Kesehatan outlet", "Outlet health")} className="max-h-[240px] shrink-0 space-y-3 overflow-y-auto border-t border-[#dce7e2] bg-white p-4 pr-20 xl:max-h-none xl:w-[280px] xl:border-l xl:border-t-0 xl:pb-28 xl:pr-4">
      <div className="hidden items-center gap-3 xl:flex"><Image src="/brand/ganita-ai-headshot-transparent.png" alt="Ganita" width={40} height={40} /><p className="font-semibold">{t("Kesehatan outlet", "Outlet health")}</p></div>
      <label className="block text-xs font-semibold text-[#53716a]">{t("Outlet", "Outlet")}
        <select aria-label={t("Restoran terpilih", "Selected restaurant")} className="mt-1 w-full rounded border border-[#dce7e2] bg-white p-2 text-sm text-[#173d34]" value={selected.id} onChange={e => setSelectedId(e.target.value)}>{data?.outlets.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select>
      </label>
      <div className="hidden space-y-2 xl:block">{data?.outlets.map(o => <button aria-pressed={selected.id === o.id} key={o.id} onClick={() => setSelectedId(o.id)} className={`flex w-full items-center justify-between gap-2 rounded-md border p-3 text-left text-sm ${selected.id === o.id ? "border-[#15947d] bg-[#eaf8f4]" : "border-[#e0e8e5]"}`}><span className="min-w-0 break-words">{o.name}</span><strong className={`shrink-0 ${o.score == null ? "text-[#687b83]" : o.score < 60 ? "text-[#ba534a]" : o.score < 78 ? "text-[#966a16]" : "text-[#168263]"}`}>{o.score ?? "—"}</strong></button>)}</div>
      <div className="text-xs leading-5 text-[#53716a]"><p>{selected.score === null ? t("Skor belum tersedia. Lengkapi transaksi, HPP, dan biaya operasional.", "Score unavailable. Complete sales, COGS, and operating expenses.") : `${t("Skor kesehatan", "Health score")}: ${selected.score}/100`}</p><p className="hidden xl:block">{selected.timezone} · {data?.from} – {data?.to}</p></div>
      <button disabled={inspectionBusy} onClick={async () => {
        setInspectionBusy(true); setInspectionMessage("");
        try { await workspace("inspections", "POST", { outletId: selected.id }); refresh(); setInspectionMessage(t("Pemeriksaan tersimpan di Laporan.", "Inspection saved in Reports.")); }
        catch (e) { setInspectionMessage(e instanceof Error ? e.message : t("Pemeriksaan gagal.", "Inspection failed.")); }
        finally { setInspectionBusy(false); }
      }} className="flex items-center gap-2 rounded border px-3 py-2 text-sm disabled:opacity-50"><RefreshCw size={16} className={inspectionBusy ? "animate-spin" : ""} />{inspectionBusy ? t("Memeriksa...", "Inspecting...") : t("Periksa outlet", "Inspect outlet")}</button>
      {inspectionMessage && <p role="status" className="text-sm">{inspectionMessage}</p>}
    </section>
  </div>;
}

function PageFrame({
  eyebrow,
  title,
  description,
  action,
  hideHeading = false,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: string;
  hideHeading?: boolean;
  children: React.ReactNode;
}) {
  const language = useLanguage();
  const titleMap: Record<string, string> = {
    Settings: "Pengaturan",
    "AI Prescriptions": "Resep AI",
    "Inventory Risk": "Risiko Inventori",
    Integrations: "Integrasi",
    Reports: "Laporan",
    "Sales & Performance": "Penjualan & Performa",
  };
  const actionMap: Record<string, string> = {
    "Create prescription": "Buat resep",
    "Add stock count": "Tambah stok",
    "Add integration": "Tambah integrasi",
    "Generate report": "Buat laporan",
    "Add menu": "Tambah menu",
    "Add ingredient": "Tambah bahan",
  };
  return (
    <div>
      <div className="mb-6 text-left">
        <p className="max-w-3xl text-base leading-7 text-[#648078]">{description}</p>
        {action ? (
          <button className="mt-4 flex items-center gap-2 rounded-lg bg-[#173d34] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#235247]">
            <Plus size={17} />
            {language === "id" ? (actionMap[action] ?? action) : action}
          </button>
        ) : null}
      </div>
      {children}
    </div>
  );
}
function SectionHeading({
  eyebrow,
  title,
  icon: Icon,
}: {
  eyebrow: string;
  title: string;
  icon: typeof TrendingUp;
}) {
  return (
    <div className="flex items-start justify-between">
      <div>
        <p className="text-sm font-semibold text-[#15947d]">{eyebrow}</p>
        <h3 className="mt-1 text-xl font-semibold">{title}</h3>
      </div>
      <Icon size={20} className="text-[#15947d]" />
    </div>
  );
}
function MetricCard({
  label,
  value,
  change,
  negative = false,
  icon: Icon,
}: {
  label: string;
  value: string;
  change: string;
  negative?: boolean;
  icon: typeof TrendingUp;
}) {
  return (
    <section className="rounded-2xl border border-[#dce7e2] bg-white p-5 shadow-[0_8px_26px_rgba(22,60,52,0.05)]">
      <div className="flex items-center justify-between">
        <p className="text-sm text-[#6d867e]">{label}</p>
        <Icon size={19} className="text-[#15947d]" />
      </div>
      <div className="mt-4 flex items-end justify-between gap-3">
        <p className="text-2xl font-semibold tracking-tight">{value}</p>
        <span
          className={`flex items-center gap-1 text-xs font-semibold ${negative ? "text-[#d06f55]" : "text-[#19895c]"}`}
        >
          {negative ? <ArrowDownRight size={14} /> : <ArrowUpRight size={14} />}
          {change}
        </span>
      </div>
    </section>
  );
}
function StatusPill({ status }: { status: string }) {
  const critical = /critical|kritis|spike|lonjakan|stockout|kehabisan/i.test(status);
  const warn = /attention|perlu perhatian|fair|cukup|expiry|kedaluwarsa|overstock|berlebih/i.test(status);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${critical ? "bg-[#fff0ed] text-[#d86f55]" : warn ? "bg-[#fff7e2] text-[#ad7517]" : "bg-[#e9f8ef] text-[#238854]"}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {status}
    </span>
  );
}
function ReportCard({
  title,
  detail,
  date,
}: {
  title: string;
  detail: string;
  date: string;
}) {
  return (
    <div className="flex items-start gap-4 rounded-2xl border border-[#dce7e2] bg-white p-5 shadow-sm">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#eaf8f4] text-[#15947d]">
        <FileText size={21} />
      </div>
      <div className="flex-1">
        <h3 className="font-semibold">{title}</h3>
        <p className="mt-1 text-sm leading-6 text-[#6c867e]">{detail}</p>
        <p className="mt-3 text-xs font-medium text-[#8da29b]">{date}</p>
      </div>
      <button className="rounded-lg border border-[#dce7e2] px-3 py-2 text-xs font-semibold text-[#15947d] hover:bg-[#effaf6]">
        Ekspor
      </button>
    </div>
  );
}
function pageTitle(active: MenuKey, language: Language) {
  return language === "id"
    ? (navItems.find((item) => item.key === active)?.id ?? "Dasbor")
    : (navItems.find((item) => item.key === active)?.en ?? "Health Dashboard");
}
function scoreTone(score: number) {
  return score < 60
    ? "bg-[#e57f63]"
    : score < 75
      ? "bg-[#f3ba4b]"
      : "bg-[#37ba88]";
}

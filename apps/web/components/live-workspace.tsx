"use client";
import Image from "next/image";
import { useEffect, useState, type ReactNode } from "react";
import { RefreshCw, AlertCircle } from "lucide-react";
import { OutletSetupState } from "./outlet-setup-state";
import { SalesImportButton } from "./sales-import-dialog";
import { SalesTables } from "./sales-tables";

type Totals = { netSales: number; transactionCount: number; averageOrderValue: number; cogs: number | null; opex: number | null; grossProfit: number | null; netProfit: number | null; foodCost: number | null; margin: number | null; costComplete: boolean; opexComplete: boolean };
export type LiveData = { from: string; to: string; currency: string; timezone: string; generatedAt: string; summary: Totals; organizationScore: number | null;
  outlets: Array<Totals & { id: string; name: string; code: string; timezone: string; score: number | null; lastUpdatedAt: string | null; health: { status: string; issues: Array<{ type: string; currentValue?: number; targetValue?: number; title: string; description: string }> } | null }>;
  metrics: Array<{ outletId: string; date: string; netSales: number; transactionCount: number }>;
  products: Array<{ id: string; name: string; sku: string | null; category: string | null; active: boolean; sellingPrice: number | null; estimatedCost: number | null }>;
  balances: Array<{ id: string; name: string; location: string; onHand: number; unit: string; reorderPoint: number | null }>;
};

export function useDashboard(outletId: string, from = "", to = "") {
  const [data, setData] = useState<LiveData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const refresh = () => setRevision(n => n + 1);
  useEffect(() => {
    window.addEventListener("ganita-data-updated", refresh);
    return () => window.removeEventListener("ganita-data-updated", refresh);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setData(null); setError(""); setLoading(true);
    const query = new URLSearchParams();
    if (outletId) query.set("outletId", outletId);
    if (from) query.set("from", from);
    if (to) query.set("to", to);
    void fetch(`/api/dashboard?${query}`, { signal: controller.signal, cache: "no-store" }).then(async response => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message ?? "Data belum dapat dimuat.");
      if (!controller.signal.aborted) setData(result.data);
    }).catch(error => { if (!controller.signal.aborted) setError(error.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [outletId, from, to, revision]);
  return { data, error, loading, refresh };
}

export function LiveWorkspace({ outletId, view, userName, language, children, onNavigate }: { outletId: string; view: string; userName: string; language: "id" | "en"; children?: ReactNode; onNavigate?: (view: "integrations" | "outlets") => void }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");
  const { data, error, loading, refresh } = useDashboard(outletId, from, to);
  const t = (id: string, en: string) => language === "id" ? id : en;
  const locale = language === "id" ? "id-ID" : "en-US";
  const number = (n: number | null) => n == null ? "—" : new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(n);
  const money = (n: number | null) => n == null ? "—" : new Intl.NumberFormat(locale, { style: "currency", currency: data?.currency ?? "IDR", maximumFractionDigits: 0 }).format(n);
  const issueLabel: Record<string, string> = { HIGH_HPP: "HPP di atas target", HIGH_OPEX: "Biaya operasional di atas target", SALES_DECLINE: "Penjualan menurun", EXCESSIVE_DISCOUNT: "Diskon di atas target", MARGIN_DECLINE: "Margin di bawah acuan", LOW_AVERAGE_ORDER: "Rata-rata transaksi menurun" };
  const summary = data?.summary;
  return <section className="space-y-6" aria-busy={loading}>
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-3"><Image src="/brand/ganita-ai-headshot-transparent.png" width={48} height={48} alt="Ganita" className="h-12 w-12 object-contain" /><p className="text-sm text-[#53716a]">{view === "dashboard" ? `${t("Halo", "Hello")}, ${userName}. ` : ""}{t("Ringkasan data outlet terpilih.", "Selected outlet data.")}</p></div>
      <div className="flex flex-wrap items-end gap-2">
        {view === "sales" && <SalesImportButton language={language} />}
        <label className="text-xs">{t("Dari", "From")}<input aria-label={t("Tanggal mulai", "Start date")} type="date" value={from || data?.from || ""} onChange={e => setFrom(e.target.value)} className="mt-1 block rounded border border-[#dce7e2] bg-white px-2 py-2 text-sm" /></label>
        <label className="text-xs">{t("Sampai", "To")}<input aria-label={t("Tanggal akhir", "End date")} type="date" value={to || data?.to || ""} onChange={e => setTo(e.target.value)} className="mt-1 block rounded border border-[#dce7e2] bg-white px-2 py-2 text-sm" /></label>
        <button onClick={refresh} disabled={loading} title={t("Muat ulang", "Refresh")} aria-label={t("Muat ulang", "Refresh")} className="flex h-10 w-10 items-center justify-center rounded border bg-white"><RefreshCw size={17} className={loading ? "animate-spin" : ""} /></button>
      </div>
    </div>
    {error && <div role="alert" className="flex gap-2 border-l-4 border-red-500 bg-red-50 p-4 text-sm text-red-800"><AlertCircle size={18} />{error}</div>}
    {loading && <p role="status" className="py-8 text-sm">{t("Memuat data...", "Loading data...")}</p>}
    {data && !data.outlets.length && <OutletSetupState language={language} onNavigate={onNavigate} />}
    {data && summary && data.outlets.length > 0 && <>
      <p className="text-xs text-[#53716a]">{data.from} – {data.to} · {outletId ? data.outlets[0]?.name : t("Semua outlet", "All outlets")} · {data.timezone}</p>
      {!data.metrics.length && <div className="border-l-4 border-[#15947d] bg-white p-5"><p className="font-semibold">{t("Belum ada transaksi pada periode ini", "No transactions in this period")}</p><p className="mt-1 text-sm text-[#53716a]">{t("Pilih periode lain atau kirim transaksi melalui CSV/API. Skor belum tersedia.", "Choose another period or import transactions through CSV/API. No score is available yet.")}</p></div>}
      {["dashboard", "health", "sales", "analysis"].includes(view) && <>
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          {[[t("Penjualan bersih", "Net sales"), money(summary.netSales)], [t("Transaksi", "Transactions"), number(summary.transactionCount)], [t("Laba kotor", "Gross profit"), money(summary.grossProfit)], [view === "sales" ? t("Rata-rata transaksi", "Average order") : t("Skor kesehatan", "Health score"), view === "sales" ? money(summary.averageOrderValue) : number(data.organizationScore)]].map(([label, value]) => <div key={label} className="rounded-lg border border-[#dce7e2] bg-white p-4"><p className="text-xs text-[#53716a]">{label}</p><p className="mt-2 break-words text-xl font-semibold">{value}</p></div>)}
        </div>
        {view !== "sales" && data.metrics.length > 0 && (!summary.costComplete || !summary.opexComplete) && <p role="status" className="border-l-4 border-amber-400 bg-amber-50 p-3 text-sm text-amber-900">{t("Data biaya belum lengkap. Laba bersih dan skor kesehatan belum dapat ditentukan.", "Cost data is incomplete. Net profit and health score are not available.")} {!summary.costComplete && t("HPP belum lengkap. ", "COGS is incomplete. ")} {!summary.opexComplete && t("OPEX belum lengkap.", "OPEX is incomplete.")}</p>}
        {view !== "sales" && <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead className="border-b border-[#dce7e2] text-xs text-[#53716a]"><tr>{["Outlet", t("Penjualan", "Sales"), "HPP", t("Margin kotor", "Gross margin"), t("Skor", "Score"), t("Data diperbarui", "Data updated")].map(h => <th key={h} className="px-3 py-3 font-medium">{h}</th>)}</tr></thead><tbody>{data.outlets.map(o => <tr key={o.id} className="border-b border-[#e1ebe6]"><td className="px-3 py-4 font-medium">{o.name}<span className="block text-xs font-normal text-[#53716a]">{o.code}</span></td><td className="px-3 py-4">{money(o.netSales)}</td><td className="px-3 py-4">{o.foodCost == null ? "—" : `${number(o.foodCost)}%`}</td><td className="px-3 py-4">{o.margin == null ? "—" : `${number(o.margin)}%`}</td><td className="px-3 py-4">{number(o.score)}</td><td className="px-3 py-4 text-xs">{o.lastUpdatedAt ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: o.timezone }).format(new Date(o.lastUpdatedAt)) : "—"}</td></tr>)}</tbody></table></div>}
      </>}
      {view === "sales" && <SalesTables key={`${outletId}:${from}:${to}`} data={data} language={language} />}
      {["health", "analysis", "dashboard"].includes(view) && <div className="divide-y divide-[#dce7e2]">{data.outlets.flatMap(o => o.health?.issues.map((issue, i) => <div key={`${o.id}-${i}`} className="flex items-start gap-3 py-4"><AlertCircle size={18} className="mt-1 shrink-0 text-amber-600" /><div><p className="text-sm font-semibold">{o.name}: {language === "id" ? issueLabel[issue.type] ?? issue.title : issue.title}</p><p className="mt-1 text-sm text-[#53716a]">{t("Nilai", "Value")}: {number(issue.currentValue ?? null)} · {t("Target", "Target")}: {number(issue.targetValue ?? null)}</p></div></div>) ?? [])}</div>}
      {["menu", "ingredients"].includes(view) && <input aria-label={t("Cari", "Search")} placeholder={t("Cari nama...", "Search name...")} value={search} onChange={e => setSearch(e.target.value)} className="w-full max-w-md rounded border bg-white px-3 py-2 text-sm" />}
      {view === "menu" && <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{[t("Menu", "Menu"), t("Harga jual", "Selling price"), t("Estimasi HPP", "Estimated cost"), "Status"].map(h => <th key={h} className="py-3">{h}</th>)}</tr></thead><tbody>{data.products.filter(p => p.name.toLowerCase().includes(search.toLowerCase())).map(p => <tr key={p.id} className="border-t border-[#e1ebe6]"><td className="py-3">{p.name}</td><td>{money(p.sellingPrice)}</td><td>{money(p.estimatedCost)}</td><td>{p.active ? t("Aktif", "Active") : t("Nonaktif", "Inactive")}</td></tr>)}</tbody></table>{!data.products.length && <p className="py-5 text-sm">{t("Belum ada menu untuk outlet ini.", "No menu items for this outlet.")}</p>}</div>}
      {view === "ingredients" && <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{[t("Bahan", "Ingredient"), t("Lokasi stok", "Stock location"), t("Saldo", "On hand"), t("Batas pemesanan", "Reorder point")].map(h => <th key={h} className="py-3">{h}</th>)}</tr></thead><tbody>{data.balances.filter(b => b.name.toLowerCase().includes(search.toLowerCase())).map(b => <tr key={b.id} className="border-t border-[#e1ebe6]"><td className="py-3">{b.name}</td><td>{b.location}</td><td className={b.reorderPoint != null && b.onHand <= b.reorderPoint ? "text-red-700" : ""}>{number(b.onHand)} {b.unit}</td><td>{number(b.reorderPoint)}</td></tr>)}</tbody></table>{!data.balances.length && <p className="py-5 text-sm">{t("Belum ada saldo stok untuk outlet ini.", "No stock balances for this outlet.")}</p>}</div>}
    </>}
    {children}
  </section>;
}

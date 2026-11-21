"use client";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import type { LiveData } from "./live-workspace";
import type { Language } from "../lib/workspace-client";
import { inputClass, secondaryClass } from "./workspace-ui";

export function SalesTables({ data, language }: { data: LiveData; language: Language }) {
  const [view, setView] = useState<"outlets" | "daily">("outlets");
  const [search, setSearch] = useState(""), [sort, setSort] = useState("sales"), [page, setPage] = useState(1), [size, setSize] = useState(25);
  const t = (id: string, en: string) => language === "id" ? id : en;
  const locale = language === "id" ? "id-ID" : "en-US";
  const money = (value: number) => new Intl.NumberFormat(locale, { style: "currency", currency: data.currency, maximumFractionDigits: 0 }).format(value);
  const number = (value: number) => new Intl.NumberFormat(locale).format(value);
  const daily = useMemo(() => {
    const groups = new Map<string, { date: string; netSales: number; transactionCount: number }>();
    for (const metric of data.metrics) {
      const row = groups.get(metric.date) ?? { date: metric.date, netSales: 0, transactionCount: 0 };
      row.netSales += metric.netSales; row.transactionCount += metric.transactionCount;
      groups.set(metric.date, row);
    }
    return [...groups.values()].sort((a, b) => b.date.localeCompare(a.date));
  }, [data.metrics]);
  const outlets = useMemo(() => data.outlets.filter(outlet => `${outlet.name} ${outlet.code}`.toLowerCase().includes(search.trim().toLowerCase())).sort((a, b) => sort === "name" ? a.name.localeCompare(b.name, locale) || a.code.localeCompare(b.code) : b.netSales - a.netSales || a.name.localeCompare(b.name, locale)), [data.outlets, search, sort, locale]);
  const total = view === "outlets" ? outlets.length : daily.length;
  const pages = Math.max(1, Math.ceil(total / size)), current = Math.min(page, pages), start = (current - 1) * size;
  return <section aria-label={t("Daftar penjualan", "Sales list")} className="space-y-4 border-t border-[#dce7e2] pt-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="inline-flex rounded border border-[#cbded6] bg-white p-1">{(["outlets", "daily"] as const).map(key => <button key={key} aria-pressed={view === key} onClick={() => { setView(key); setPage(1); }} className={`rounded px-3 py-2 text-sm font-medium ${view === key ? "bg-[#173d34] text-white" : "text-[#53716a]"}`}>{key === "outlets" ? t("Per outlet", "By outlet") : t("Per hari", "By day")}</button>)}</div>
      {view === "outlets" && <div className="flex flex-wrap items-center gap-2"><div className="relative"><Search className="pointer-events-none absolute left-3 top-3 text-[#53716a]" size={16} /><input aria-label={t("Cari outlet pada daftar penjualan", "Search outlets in sales list")} placeholder={t("Nama atau kode outlet", "Outlet name or code")} className={`${inputClass} mt-0 pl-9`} value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} /></div><select aria-label={t("Urutan penjualan", "Sales sort order")} className="h-10 max-w-full rounded border border-[#cbded6] bg-white px-3 text-sm" value={sort} onChange={event => { setSort(event.target.value); setPage(1); }}><option value="sales">{t("Penjualan tertinggi", "Highest sales")}</option><option value="name">{t("Nama A–Z", "Name A–Z")}</option></select></div>}
    </div>
    <div className="overflow-x-auto"><table className="w-full min-w-[540px] text-left text-sm"><thead className="border-b border-[#dce7e2] text-xs text-[#53716a]"><tr><th className="px-3 py-3">{view === "outlets" ? "Outlet" : t("Tanggal", "Date")}</th><th className="px-3 py-3 text-right">{t("Penjualan bersih", "Net sales")}</th><th className="px-3 py-3 text-right">{t("Transaksi", "Transactions")}</th>{view === "outlets" && <th className="px-3 py-3 text-right">{t("Rata-rata transaksi", "Average order")}</th>}</tr></thead><tbody>
      {view === "outlets" ? outlets.slice(start, start + size).map(outlet => <tr key={outlet.id} className="border-b border-[#e1ebe6]"><td className="max-w-80 break-words px-3 py-4 font-medium">{outlet.name}<span className="block text-xs font-normal text-[#53716a]">{outlet.code}</span></td><td className="whitespace-nowrap px-3 py-4 text-right tabular-nums">{money(outlet.netSales)}</td><td className="px-3 py-4 text-right tabular-nums">{number(outlet.transactionCount)}</td><td className="whitespace-nowrap px-3 py-4 text-right tabular-nums">{outlet.transactionCount ? money(outlet.netSales / outlet.transactionCount) : "—"}</td></tr>) : daily.slice(start, start + size).map(row => <tr key={row.date} className="border-b border-[#e1ebe6]"><td className="px-3 py-4">{new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(row.date.slice(0, 10) + "T00:00:00Z"))}</td><td className="px-3 py-4 text-right tabular-nums">{money(row.netSales)}</td><td className="px-3 py-4 text-right tabular-nums">{number(row.transactionCount)}</td></tr>)}
    </tbody></table>{!total && <p className="py-8 text-sm text-[#53716a]">{search && view === "outlets" ? t("Tidak ada outlet yang sesuai.", "No matching outlets.") : t("Belum ada data penjualan.", "No sales data yet.")}</p>}</div>
    <div className="flex flex-wrap items-center gap-6 text-sm text-[#53716a]"><span>{total ? start + 1 : 0}–{Math.min(start + size, total)} {t("dari", "of")} {number(total)} {view === "outlets" ? "outlet" : t("hari", "days")}</span><div className="flex items-center gap-2"><select aria-label={t("Baris per halaman", "Rows per page")} className="h-10 w-20 shrink-0 rounded border border-[#cbded6] bg-white px-2 text-sm" value={size} onChange={event => { setSize(Number(event.target.value)); setPage(1); }}>{[25, 50, 100].map(value => <option key={value} value={value}>{value}</option>)}</select><button className={secondaryClass} disabled={current === 1} title={t("Halaman sebelumnya", "Previous page")} aria-label={t("Halaman sebelumnya", "Previous page")} onClick={() => setPage(current - 1)}><ChevronLeft size={16} /></button><span className="whitespace-nowrap" aria-live="polite">{current} / {pages}</span><button className={secondaryClass} disabled={current === pages} title={t("Halaman berikutnya", "Next page")} aria-label={t("Halaman berikutnya", "Next page")} onClick={() => setPage(current + 1)}><ChevronRight size={16} /></button></div></div>
  </section>;
}

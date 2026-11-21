"use client";
import { useState } from "react";
import { Bell, X } from "lucide-react";
import { workspace, type Language } from "../lib/workspace-client";
import { Notice } from "./workspace-ui";
export function AlertsMenu({ language, outletId }: { language: Language; outletId: string }) {
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [alerts, setAlerts] = useState<Array<{ outlet: string; type: string; ingredient?: string }>>([]);
  const t = (id: string, en: string) => language === "id" ? id : en;
  const labels: Record<string, string> = { HIGH_HPP: t("Biaya bahan tinggi", "High food cost"), HIGH_OPEX: t("Biaya operasional tinggi", "High OPEX"), SALES_DECLINE: t("Penjualan menurun", "Sales decline"), EXCESSIVE_DISCOUNT: t("Diskon berlebih", "Excessive discount"), MARGIN_DECLINE: t("Margin perlu perhatian", "Margin needs attention"), LOW_AVERAGE_ORDER: t("Nilai transaksi menurun", "Average order declined"), LOW_STOCK: t("Stok rendah", "Low stock"), HIGH_WASTE: t("Bahan terbuang tinggi", "High waste") };
  return <div className="relative"><button className="rounded p-2" title={t("Notifikasi", "Alerts")} aria-label={t("Notifikasi", "Alerts")} aria-expanded={open} onClick={async () => { if (open) { setOpen(false); return; } setOpen(true); setBusy(true); setError(""); try { setAlerts(await workspace(`alerts${outletId ? `?outletId=${outletId}` : ""}`)); } catch (e) { setError(e instanceof Error ? e.message : "Error"); } finally { setBusy(false); } }}><Bell size={19} /></button>{open && <section className="absolute right-0 top-12 z-40 max-h-96 w-[min(320px,calc(100vw-2rem))] overflow-y-auto rounded-lg border bg-white p-4 shadow-lg"><div className="mb-3 flex justify-between"><h2 className="font-semibold">{t("Notifikasi", "Alerts")}</h2><button aria-label={t("Tutup", "Close")} onClick={() => setOpen(false)}><X size={16} /></button></div><Notice error={error} />{busy ? <p className="text-sm">{t("Memuat...", "Loading...")}</p> : alerts.length ? alerts.map((a, index) => <p key={index} className="border-t py-3 text-sm"><strong>{a.outlet}</strong><br />{labels[a.type] ?? a.type}{a.ingredient ? `: ${a.ingredient}` : ""}</p>) : <p className="text-sm text-[#587068]">{t("Tidak ada peringatan dari data yang tersedia.", "No alerts from available data.")}</p>}</section>}</div>;
}

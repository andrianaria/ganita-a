"use client";
import { useEffect, useMemo, useState } from "react";
import { Download, Upload, RefreshCw } from "lucide-react";
import { parseSalesCsv, csvImportPayload, type CsvRow } from "../lib/csv-import";
import { exportOutletCodes, inspectSalesImport, salesCsvTemplate, type ImportOutlet } from "../lib/sales-import";
import { workspace, dataUpdated, type Language } from "../lib/workspace-client";
import { Editor, Field, Notice, inputClass, buttonClass, secondaryClass } from "./workspace-ui";

function downloadCsv(name: string, content: string) {
  const url = URL.createObjectURL(new Blob(["\uFEFF", content], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function SalesImportButton({ language }: { language: Language }) {
  const [open, setOpen] = useState(false), [message, setMessage] = useState("");
  const t = (id: string, en: string) => language === "id" ? id : en;
  return <div>
    <button className={buttonClass} onClick={() => { setMessage(""); setOpen(true); }}><Upload size={16} />{t("Impor data penjualan", "Import sales data")}</button>
    {message && <p role="status" className="mt-2 max-w-sm text-sm text-emerald-800">{message}</p>}
    {open && <SalesImportDialog language={language} onClose={() => setOpen(false)} onImported={count => { setOpen(false); setMessage(t(`${count} transaksi diproses. Data penjualan diperbarui.`, `${count} transactions processed. Sales data updated.`)); dataUpdated(); }} />}
  </div>;
}

function SalesImportDialog({ language, onClose, onImported }: { language: Language; onClose: () => void; onImported: (count: number) => void }) {
  const t = (id: string, en: string) => language === "id" ? id : en;
  const [outlets, setOutlets] = useState<ImportOutlet[]>([]), [loading, setLoading] = useState(true), [loadError, setLoadError] = useState("");
  const [revision, setRevision] = useState(0), [rows, setRows] = useState<CsvRow[]>([]), [filename, setFilename] = useState("");
  const [sourceName, setSourceName] = useState("CSV POS"), [error, setError] = useState(""), [busy, setBusy] = useState(false), [parsing, setParsing] = useState(false);
  const [search, setSearch] = useState("");
  useEffect(() => {
    let active = true;
    setLoading(true); setLoadError("");
    void workspace<ImportOutlet[]>("outlets").then(data => { if (active) setOutlets(data); }).catch(() => { if (active) setLoadError(t("Daftar outlet gagal dimuat.", "Could not load outlets.")); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [revision, language]);
  const inspection = useMemo(() => rows.length ? inspectSalesImport(rows, outlets) : null, [rows, outlets]);
  const preview = inspection?.outlets.filter(outlet => `${outlet.name ?? ""} ${outlet.code}`.toLowerCase().includes(search.toLowerCase())) ?? [];
  const parseFile = async (file: File) => {
    setParsing(true); setRows([]); setError(""); setFilename(file.name); setSearch("");
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error(t("Ukuran CSV maksimal 10 MB.", "Maximum CSV size is 10 MB."));
      const parsed = parseSalesCsv(await file.text());
      const payload = csvImportPayload(parsed, "CSV POS");
      if (payload.rows.length > 5000 || new TextEncoder().encode(JSON.stringify(payload)).length > 900000) throw new Error(t("Berkas terlalu besar untuk satu impor. Bagi per outlet atau periode, lalu unggah kembali.", "This file is too large for one import. Split by outlet or period and upload again."));
      setRows(parsed);
    } catch (failure) { setError(failure instanceof Error ? failure.message : t("CSV tidak dapat dibaca.", "Could not read CSV.")); }
    finally { setParsing(false); }
  };
  const submit = async () => {
    if (busy || parsing || loading || loadError || !inspection || inspection.unknownCodes.length) return;
    setBusy(true); setError("");
    try {
      const payload = csvImportPayload(rows, sourceName);
      const response = await fetch("/api/import/csv", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message ?? t("Impor gagal. Coba lagi.", "Import failed. Please retry."));
      if (typeof result.data?.imported !== "number") throw new Error(t("Hasil impor belum dapat dikonfirmasi. Kirim ulang dengan nama sumber dan ID transaksi yang sama.", "Import could not be confirmed. Retry with the same source name and transaction IDs."));
      onImported(result.data.imported);
    } catch (failure) { setError(failure instanceof Error ? failure.message : t("Impor gagal.", "Import failed.")); }
    finally { setBusy(false); }
  };
  return <Editor title={t("Impor data penjualan", "Import sales data")} language={language} onClose={onClose} busy={busy || parsing} error={error} submitDisabled={loading || !!loadError || !inspection || !!inspection.unknownCodes.length || !sourceName.trim()} submitLabel={busy ? t("Mengimpor...", "Importing...") : t("Konfirmasi impor", "Confirm import")} onSubmit={event => { event.preventDefault(); void submit(); }}>
    <div className="flex flex-wrap gap-2"><button type="button" className={secondaryClass} onClick={() => downloadCsv("ganita-template-penjualan.csv", salesCsvTemplate)}><Download size={16} />{t("Unduh template CSV", "Download CSV template")}</button><button type="button" className={secondaryClass} disabled={loading || !!loadError || !outlets.length} onClick={() => downloadCsv("ganita-kode-outlet.csv", exportOutletCodes(outlets))}><Download size={16} />{t("Unduh kode outlet", "Download outlet codes")}</button></div>
    {loading && <p role="status" className="text-sm">{t("Memuat outlet...", "Loading outlets...")}</p>}
    {loadError && <div><Notice error={loadError} /><button type="button" className={secondaryClass} onClick={() => setRevision(n => n + 1)}><RefreshCw size={16} />{t("Coba lagi", "Retry")}</button></div>}
    {!loading && !loadError && !outlets.length && <Notice error={t("Belum ada outlet. Tambahkan atau sinkronkan outlet sebelum impor penjualan.", "No outlets yet. Add or sync outlets before importing sales.")} />}
    <Field label={t("Nama sumber CSV", "CSV source name")}><input required maxLength={100} disabled={busy || parsing} value={sourceName} onChange={event => setSourceName(event.target.value)} className={inputClass} /></Field>
    <p className="text-xs text-[#53716a]">{t("Nama sumber + kode outlet + ID transaksi yang sama akan memperbarui transaksi sebelumnya.", "The same source name + outlet code + transaction ID updates the existing transaction.")}</p>
    <label className={`${secondaryClass} relative cursor-pointer focus-within:ring-2 focus-within:ring-[#15947d] ${busy || parsing || loading || loadError || !outlets.length ? "opacity-50" : ""}`}><Upload size={16} />{filename ? t("Ganti CSV", "Replace CSV") : t("Pilih CSV", "Choose CSV")}<input aria-label={t("Berkas CSV", "CSV file")} type="file" accept=".csv,text/csv" disabled={busy || parsing || loading || !!loadError || !outlets.length} className="sr-only" onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void parseFile(file); }} /></label>
    <details className="text-xs text-[#53716a]"><summary className="cursor-pointer py-1 font-medium">{t("Format kolom CSV", "CSV column format")}</summary>
    <p className="text-xs text-[#53716a]">{t("Satu baris per item transaksi. outlet_code harus cocok dengan kode Ganita. date: ISO 8601 dengan zona waktu (2026-09-19T12:00:00+07:00). cost boleh kosong jika HPP belum diketahui.", "One row per transaction item. outlet_code must match Ganita's code. date: ISO 8601 with timezone (2026-09-19T12:00:00+07:00). Leave cost blank if unknown.")}</p>
    </details>
    {parsing && <p role="status">{t("Memeriksa CSV...", "Checking CSV...")}</p>}
    {inspection && <div className="space-y-3 border-t pt-4">
      <p className="break-all text-sm font-semibold">{filename}</p><p className="text-sm">{rows.length} {t("baris", "rows")} · {inspection.transactionCount} {t("transaksi", "transactions")} · {inspection.outlets.length} outlet</p>
      {!!inspection.unknownCodes.length && <Notice error={t(`${inspection.unknownCodes.length} kode outlet belum dikenal. Perbaiki CSV atau daftarkan outlet terlebih dahulu. Belum ada data yang dikirim.`, `${inspection.unknownCodes.length} outlet codes are unknown. Correct the CSV or register these outlets first. No data has been sent.`)} />}
      <Field label={t("Cari outlet dalam berkas", "Search outlets in file")}><input className={inputClass} value={search} onChange={event => setSearch(event.target.value)} /></Field>
      <div className="max-h-60 overflow-auto"><table className="w-full text-left text-sm"><thead className="sticky top-0 bg-white"><tr><th className="py-2">Outlet</th><th>{t("Transaksi", "Transactions")}</th><th>Status</th></tr></thead><tbody>{preview.slice(0, 50).map(outlet => <tr key={outlet.code} className="border-t"><td className="max-w-48 break-words py-2">{outlet.name ?? outlet.code}<span className="block text-xs text-[#53716a]">{outlet.code}</span></td><td>{outlet.transactions}</td><td className={outlet.name === null ? "text-red-700" : "text-emerald-700"}>{outlet.name === null ? t("Tidak dikenal", "Unknown") : t("Siap", "Ready")}</td></tr>)}</tbody></table>{!preview.length && <p className="py-3 text-sm">{t("Tidak ada hasil.", "No results.")}</p>}</div>
      {preview.length > 50 && <p className="text-xs">{t(`Menampilkan 50 dari ${preview.length} outlet. Persempit pencarian untuk outlet lain.`, `Showing 50 of ${preview.length} outlets. Refine your search to find others.`)}</p>}
    </div>}
  </Editor>;
}

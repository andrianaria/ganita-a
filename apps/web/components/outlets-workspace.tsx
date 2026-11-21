"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Link2, Search } from "lucide-react";
import { OutletMappingEditor, type MappingPreset } from "./outlet-mapping-editor";
import { workspace, dataUpdated, type Language } from "../lib/workspace-client";
import { Field, Notice, Editor, useAction, inputClass, buttonClass, secondaryClass } from "./workspace-ui";

type Hours = { day: number; mode: "open" | "closed" | "24h"; open?: string; close?: string };
type Mapping = { id: string; dataSourceId: string; externalOutletId: string; dataSource: { id: string; name: string } };
type Outlet = { id: string; brandId: string; name: string; code: string; address?: string; city?: string; country?: string; timezone: string; status: string; phone?: string; email?: string; notes?: string; openingHours?: Hours[]; dataSourceLinks?: Mapping[] };
type Named = { id: string; name: string };
const defaultHours = (): Hours[] => Array.from({ length: 7 }, (_, day) => ({ day, mode: "open", open: "09:00", close: "21:00" }));

export function OutletsWorkspace({ language }: { language: Language }) {
  const t = (id: string, en: string) => language === "id" ? id : en;
  const days = language === "id" ? ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"] : ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const router = useRouter(), action = useAction(language), modal = useAction(language);
  const [outlets, setOutlets] = useState<Outlet[]>([]), [brands, setBrands] = useState<Named[]>([]), [sources, setSources] = useState<Named[]>([]);
  const [role, setRole] = useState("VIEWER"), [timezone, setTimezone] = useState("Asia/Jakarta"), [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(""), [status, setStatus] = useState("ALL"), [editing, setEditing] = useState<Partial<Outlet> | null>(null);
  const [mapping, setMapping] = useState<MappingPreset | null>(null);
  const writable = role === "OWNER" || role === "ADMIN";
  const load = async () => {
    const rows = await workspace<Outlet[]>("outlets");
    setOutlets(rows);
    setBrands(await workspace<Named[]>("brands"));
    setSources(await workspace<Named[]>("data-sources"));
    setRole((await workspace<{ role: string }>("team")).role);
    setTimezone((await workspace<{ timezone: string }>("organizations/current")).timezone);
  };
  useEffect(() => { void load().catch(e => action.setError(e.message)).finally(() => setLoading(false)); }, []);
  const refresh = async () => { await load(); dataUpdated(); router.refresh(); };
  const startEdit = (outlet?: Outlet) => { modal.setError(""); setEditing(outlet ?? { brandId: brands[0]?.id, timezone, country: "Indonesia", status: "ACTIVE", openingHours: [] }); };
  const mapOutlet = (outlet: Outlet) => {
    const link = outlet.dataSourceLinks?.[0];
    setMapping({ sourceId: link?.dataSourceId ?? (sources.length === 1 ? sources[0].id : ""), externalId: link?.externalOutletId ?? "", outletId: outlet.id });
  };
  const visible = outlets.filter(o => (status === "ALL" || o.status === status) && `${o.name} ${o.code} ${o.city ?? ""}`.toLowerCase().includes(search.toLowerCase()));
  return <div className="space-y-5 text-left">
    <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-[#587068]">{t("Kelola lokasi, jam operasional, dan hubungan outlet dengan sistem asal.", "Manage locations, opening hours, and connections to source systems.")}</p>{writable && <button className={buttonClass} onClick={() => startEdit()}><Plus size={16} />{t("Tambah outlet", "Add outlet")}</button>}</div>
    <Notice error={action.error} message={action.message} />
    <div className="flex flex-wrap items-end gap-3"><div className="min-w-48 flex-1"><Field label={t("Cari outlet", "Search outlets")}><span className="relative block"><Search size={16} className="pointer-events-none absolute left-3 top-3 text-[#587068]" /><input className={`${inputClass} pl-9`} value={search} onChange={e => setSearch(e.target.value)} /></span></Field></div><Field label={t("Status outlet", "Outlet status")}><select className={inputClass} value={status} onChange={e => setStatus(e.target.value)}><option value="ALL">{t("Semua", "All")}</option><option value="ACTIVE">{t("Aktif", "Active")}</option><option value="INACTIVE">{t("Nonaktif", "Inactive")}</option></select></Field><span className="py-2 text-sm text-[#587068]">{visible.length} outlet</span></div>
    {loading ? <p role="status">{t("Memuat outlet...", "Loading outlets...")}</p> : <div className="divide-y border-y border-[#dce7e2]">{visible.map(outlet => <article key={outlet.id} aria-label={outlet.name} className="py-4">
      <div className="grid items-center gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(140px,0.55fr)_auto]">
        <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="break-words font-semibold">{outlet.name}</h2><span className={`rounded px-2 py-0.5 text-xs ${outlet.status === "ACTIVE" ? "bg-[#e4f8f1] text-[#087968]" : "bg-gray-100 text-gray-600"}`}>{outlet.status === "ACTIVE" ? t("Aktif", "Active") : t("Nonaktif", "Inactive")}</span></div><p className="mt-1 text-sm text-[#587068]">{[outlet.code, outlet.city].filter(Boolean).join(" · ")}</p></div>
        <p className="flex min-w-0 items-center gap-2 text-sm text-[#587068]"><Link2 size={15} className="shrink-0" /><span className="break-words">{outlet.dataSourceLinks?.length ? outlet.dataSourceLinks.map(link => link.dataSource.name).join(", ") : t("Belum terhubung", "Not connected")}</span></p>
        {writable && <div className="flex flex-wrap items-center gap-2"><button className={secondaryClass} aria-label={`${t("Hubungkan outlet", "Connect outlet")} ${outlet.name}`} onClick={() => mapOutlet(outlet)}><Link2 size={15} />{outlet.dataSourceLinks?.length ? t("Ubah koneksi", "Change connection") : t("Hubungkan", "Connect")}</button><button className={secondaryClass} title={t("Edit outlet", "Edit outlet")} aria-label={`${t("Edit outlet", "Edit outlet")} ${outlet.name}`} onClick={() => startEdit(outlet)}><Pencil size={16} /></button></div>}
      </div>
      <details className="mt-2"><summary aria-label={`${t("Detail outlet", "Outlet details")} ${outlet.name}`} className="w-fit cursor-pointer text-xs text-[#587068]">{t("Detail", "Details")}</summary><div className="mt-3 grid gap-4 border-t border-dashed border-[#dce7e2] pt-3 text-sm sm:grid-cols-2">
        <div className="min-w-0 space-y-2"><p className="break-words">{[outlet.address, outlet.city, outlet.country].filter(Boolean).join(", ") || t("Alamat belum diisi", "Address not set")}</p>{outlet.phone && <p>{outlet.phone}</p>}{outlet.email && <p className="break-all">{outlet.email}</p>}{outlet.notes && <p className="whitespace-pre-wrap break-words text-[#587068]">{outlet.notes}</p>}<p className="break-all text-xs text-[#587068]">ID: {outlet.id}</p>{(outlet.dataSourceLinks ?? []).map(link => <p key={link.id} className="break-all text-xs text-[#587068]">{link.dataSource.name} · {link.externalOutletId}</p>)}</div>
        <div className="space-y-2"><p className="text-xs text-[#587068]">{outlet.timezone}</p>{outlet.openingHours?.length ? <dl className="space-y-1">{[...outlet.openingHours].sort((a, b) => a.day - b.day).map(h => <div key={h.day} className="flex flex-wrap justify-between gap-2"><dt>{days[h.day]}</dt><dd>{h.mode === "closed" ? t("Tutup", "Closed") : h.mode === "24h" ? t("24 jam", "24 hours") : `${h.open} - ${h.close}${h.close! < h.open! ? t(" (+1 hari)", " (+1 day)") : ""}`}</dd></div>)}</dl> : <p className="text-[#587068]">{t("Jam operasional belum diisi", "Opening hours not set")}</p>}</div>
        {writable && <button className="inline-flex w-fit items-center gap-2 text-xs text-red-700 underline" disabled={action.busy} aria-label={`${t("Hapus outlet", "Delete outlet")} ${outlet.name}`} onClick={() => { if (window.confirm(t(`Hapus ${outlet.name}? Hanya outlet kosong tanpa pemetaan yang dapat dihapus. Tindakan ini tidak dapat dibatalkan.`, `Delete ${outlet.name}? Only empty, unmapped outlets can be deleted. This cannot be undone.`))) void action.run(async () => { await workspace(`outlets/${outlet.id}`, "DELETE"); await refresh(); }); }}><Trash2 size={14} />{t("Hapus outlet", "Delete outlet")}</button>}
      </div></details>
    </article>)}{!visible.length && <p className="py-6 text-sm">{t("Tidak ada outlet yang sesuai.", "No matching outlets.")}</p>}</div>}
    {editing && <Editor language={language} title={t("Detail outlet", "Outlet details")} busy={modal.busy} error={modal.error} onClose={() => setEditing(null)} onSubmit={e => { e.preventDefault(); void modal.run(async () => {
      const { brandId, name, code, address, city, country, timezone, status, phone, email, notes, openingHours } = editing;
      await workspace(editing.id ? `outlets/${editing.id}` : "outlets", editing.id ? "PATCH" : "POST", { brandId, name, code, address: address ?? "", city: city ?? "", country: country ?? "", timezone, status, phone: phone ?? "", email: email ?? "", notes: notes ?? "", openingHours: openingHours ?? [] });
      await refresh(); setEditing(null);
    }); }}>
      <div className="grid gap-4 sm:grid-cols-2"><Field label={t("Merek", "Brand")}><select required className={inputClass} value={editing.brandId ?? ""} onChange={e => setEditing({ ...editing, brandId: e.target.value })}><option value="">{t("Pilih merek", "Select brand")}</option>{brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field><Field label="Status"><select className={inputClass} value={editing.status} onChange={e => setEditing({ ...editing, status: e.target.value })}><option value="ACTIVE">{t("Aktif", "Active")}</option><option value="INACTIVE">{t("Nonaktif", "Inactive")}</option></select></Field>
        {[["name", t("Nama outlet", "Outlet name")], ["code", t("Kode outlet", "Outlet code")], ["address", t("Alamat", "Address")], ["city", t("Kota", "City")], ["country", t("Negara", "Country")], ["timezone", t("Zona waktu IANA", "IANA timezone")], ["phone", t("Telepon", "Phone")], ["email", "Email"]].map(([key, label]) => <Field key={key} label={label}><input className={inputClass} required={["name", "code", "timezone"].includes(key)} type={key === "email" ? "email" : key === "phone" ? "tel" : "text"} value={String(editing[key as keyof Outlet] ?? "")} onChange={e => setEditing({ ...editing, [key]: e.target.value })} /></Field>)}
      </div><Field label={t("Catatan outlet", "Outlet notes")}><textarea className={inputClass} maxLength={2000} rows={3} value={editing.notes ?? ""} onChange={e => setEditing({ ...editing, notes: e.target.value })} /></Field>
      <div className="space-y-3 border-t pt-4"><label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={Boolean(editing.openingHours?.length)} onChange={e => setEditing({ ...editing, openingHours: e.target.checked ? defaultHours() : [] })} />{t("Jam operasional mingguan", "Weekly opening hours")}</label>{editing.openingHours?.map((h, index) => {
        const update = (values: Partial<Hours>) => setEditing({ ...editing, openingHours: editing.openingHours!.map((row, i) => i === index ? { ...row, ...values } : row) });
        return <fieldset key={h.day} className="grid grid-cols-2 items-end gap-2 border-b pb-3 sm:grid-cols-[90px_1fr_1fr_1fr]"><legend className="mb-1 text-sm font-medium sm:float-left">{days[h.day]}</legend><select aria-label={`${days[h.day]} ${t("status", "status")}`} className={inputClass} value={h.mode} onChange={e => update({ mode: e.target.value as Hours["mode"] })}><option value="open">{t("Buka", "Open")}</option><option value="closed">{t("Tutup", "Closed")}</option><option value="24h">{t("24 jam", "24 hours")}</option></select><input aria-label={`${days[h.day]} ${t("jam buka", "opens")}`} type="time" className={inputClass} required={h.mode === "open"} disabled={h.mode !== "open"} value={h.open ?? ""} onChange={e => update({ open: e.target.value })} /><input aria-label={`${days[h.day]} ${t("jam tutup", "closes")}`} type="time" className={inputClass} required={h.mode === "open"} disabled={h.mode !== "open"} value={h.close ?? ""} onChange={e => update({ close: e.target.value })} /></fieldset>;
      })}</div>
    </Editor>}
    {mapping && <OutletMappingEditor language={language} sources={sources} outlets={outlets} preset={mapping} onClose={() => setMapping(null)} onSaved={refresh} />}
  </div>;
}

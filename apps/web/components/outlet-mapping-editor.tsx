"use client";
import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { workspace, type Language } from "../lib/workspace-client";
import { Editor, Field, Notice, useAction, inputClass, secondaryClass } from "./workspace-ui";

type SourceOutlet = { id: string; externalOutletId: string; outletId: string; outlet: { name: string; code: string } };
type Choice = { id: string; name: string; code: string; status: string };
export type MappingPreset = { sourceId: string; externalId: string; outletId: string };

export function OutletMappingEditor({ language, sources, outlets, preset, onClose, onSaved }: {
  language: Language; sources: Array<{ id: string; name: string }>; outlets: Choice[];
  preset: MappingPreset; onClose: () => void; onSaved: () => Promise<void>;
}) {
  const t = (id: string, en: string) => language === "id" ? id : en;
  const action = useAction(language);
  const [sourceId, setSourceId] = useState(preset.sourceId), [externalId, setExternalId] = useState(preset.externalId), [outletId, setOutletId] = useState(preset.outletId);
  const [manual, setManual] = useState(false), [removeEmpty, setRemoveEmpty] = useState(false), [retry, setRetry] = useState(0);
  const [received, setReceived] = useState<{ sourceId: string; rows: SourceOutlet[] }>({ sourceId: "", rows: [] });
  const [loadError, setLoadError] = useState("");
  useEffect(() => {
    let cancelled = false;
    setLoadError(""); setReceived({ sourceId: "", rows: [] });
    if (sourceId) void workspace<SourceOutlet[]>(`data-sources/${sourceId}/mappings`).then(rows => {
      if (!cancelled) setReceived({ sourceId, rows });
    }).catch(error => { if (!cancelled) setLoadError(error.message); });
    return () => { cancelled = true; };
  }, [sourceId, retry]);
  const ready = Boolean(sourceId) && received.sourceId === sourceId;
  const rows = ready ? received.rows : [];
  const existing = rows.find(row => row.externalOutletId === externalId.trim());
  const moving = Boolean(existing && existing.outletId !== outletId);
  const same = Boolean(existing && existing.outletId === outletId);
  const target = outlets.find(outlet => outlet.id === outletId);
  const collision = rows.some(row => row.outletId === outletId && row.externalOutletId !== externalId.trim());
  const valid = ready && Boolean(externalId.trim()) && (manual || Boolean(existing)) && target?.status === "ACTIVE" && !same && !collision;
  const reset = () => { setRemoveEmpty(false); action.setError(""); };
  return <Editor language={language} title={t("Hubungkan outlet", "Connect outlet")} busy={action.busy} submitDisabled={!valid} submitLabel={t("Simpan koneksi", "Save connection")} error={action.error} onClose={onClose} onSubmit={e => {
    e.preventDefault(); if (!valid) return;
    void action.run(async () => {
      await workspace(`data-sources/${sourceId}/mappings`, existing ? "PATCH" : "POST", {
        externalOutletId: externalId.trim(), outletId,
        ...(existing ? { previousOutletId: existing.outletId, deleteEmptyOutlet: removeEmpty } : {}),
      });
      await onSaved(); onClose();
    });
  }}>
    <fieldset disabled={action.busy} className="space-y-4">
      <Field label={t("Sistem asal", "Source system")}><select required className={inputClass} value={sourceId} onChange={e => { setSourceId(e.target.value); setExternalId(""); setManual(false); reset(); }}><option value="">{t("Pilih koneksi", "Select connection")}</option>{sources.map(source => <option key={source.id} value={source.id}>{source.name}</option>)}</select></Field>
      {!sources.length && <p className="text-sm text-[#587068]">{t("Belum ada koneksi API. Buat API key di menu Integrasi terlebih dahulu.", "No API connection yet. Create an API key in Integrations first.")}</p>}
      {loadError ? <div><Notice error={loadError} /><button type="button" className={secondaryClass} onClick={() => setRetry(value => value + 1)}><RefreshCw size={16} />{t("Coba lagi", "Retry")}</button></div> : sourceId && !ready ? <p role="status" className="text-sm">{t("Memuat outlet dari sistem asal...", "Loading source outlets...")}</p> : null}
      {!manual ? <Field label={t("Outlet dari sistem asal", "Source outlet")}><select required disabled={!ready} className={inputClass} value={externalId} onChange={e => { setExternalId(e.target.value); reset(); }}><option value="">{t("Pilih outlet yang sudah diterima", "Select a received outlet")}</option>{rows.map(row => <option key={row.id} value={row.externalOutletId}>{row.outlet.name} ({row.outlet.code})</option>)}</select></Field> : <Field label={t("ID outlet di sistem asal", "External outlet ID")}><input required maxLength={255} className={inputClass} value={externalId} onChange={e => { setExternalId(e.target.value); reset(); }} /></Field>}
      {ready && !rows.length && !manual && <p className="text-sm text-[#587068]">{t("Belum ada outlet yang diterima dari koneksi ini.", "No outlets have been received from this connection.")}</p>}
      <Field label={t("Outlet Ganita tujuan", "Target Ganita outlet")}><select required className={inputClass} value={outletId} onChange={e => { setOutletId(e.target.value); reset(); }}><option value="">{t("Pilih outlet", "Select outlet")}</option>{outlets.filter(outlet => outlet.status === "ACTIVE").map(outlet => <option key={outlet.id} value={outlet.id}>{outlet.name} ({outlet.code})</option>)}</select></Field>
      {same && <p role="status" className="rounded bg-[#e4f8f1] p-3 text-sm text-[#087968]">{t("Outlet ini sudah terhubung ke tujuan yang dipilih.", "This outlet is already connected to the selected destination.")}</p>}
      {collision && <Notice error={t("Outlet tujuan sudah terhubung ke outlet lain pada sistem ini. Pilih tujuan berbeda.", "The destination is already connected to another outlet in this system. Choose a different destination.")} />}
      {moving && target && !collision && <div className="space-y-3 border-t pt-4"><p className="text-sm">{t("Pindahkan koneksi", "Move connection")}: <strong>{existing!.outlet.name}</strong> → <strong>{target.name}</strong></p><p className="text-sm text-[#587068]">{t("Hanya outlet asal tanpa riwayat operasional yang dapat dipindahkan. Data berikutnya masuk ke outlet tujuan.", "Only source outlets without operational history can be moved. Future data goes to the destination.")}</p><label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={removeEmpty} onChange={e => setRemoveEmpty(e.target.checked)} />{t("Hapus outlet duplikat yang kosong setelah dipindahkan (permanen)", "Permanently delete the empty duplicate outlet after moving")}</label></div>}
      <details className="border-t pt-3"><summary className="cursor-pointer text-xs text-[#587068]">{t("Pengaturan lanjutan", "Advanced settings")}</summary><label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={manual} onChange={e => { setManual(e.target.checked); setExternalId(""); reset(); }} />{t("Masukkan ID manual untuk outlet yang belum dikirim", "Enter an ID manually for an outlet not yet sent")}</label></details>
    </fieldset>
  </Editor>;
}

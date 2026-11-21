"use client";
import { useState, useEffect, useRef, type ReactNode, type FormEvent } from "react";
import { X, Save, RefreshCw } from "lucide-react";
import type { Language } from "../lib/workspace-client";

export const inputClass = "mt-1 w-full min-w-0 rounded border border-[#cbded6] bg-white px-3 py-2 text-sm outline-none focus:border-[#15947d] focus:ring-1 focus:ring-[#15947d] disabled:bg-gray-100";
export const buttonClass = "inline-flex items-center justify-center gap-2 rounded bg-[#173d34] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50";
export const secondaryClass = "inline-flex items-center justify-center gap-2 rounded border border-[#cbded6] bg-white px-3 py-2 text-sm font-medium disabled:opacity-50";
export function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="block min-w-0 text-sm font-medium">{label}{children}</label>; }
export function Notice({ error, message }: { error?: string; message?: string }) { return error ? <p role="alert" className="my-3 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p> : message ? <p role="status" className="my-3 rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p> : null; }
export function useAction(language: Language) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("");
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError(""); setMessage("");
    try { await action(); setMessage(language === "id" ? "Perubahan tersimpan." : "Changes saved."); }
    catch (error) { setError(error instanceof Error ? error.message : language === "id" ? "Proses gagal. Coba lagi." : "Request failed. Please retry."); }
    finally { setBusy(false); }
  };
  return { busy, error, message, run, setError, setMessage };
}
export function SaveButton({ busy, language, disabled = false, label }: { busy: boolean; language: Language; disabled?: boolean; label?: string }) { return <button disabled={busy || disabled} className={buttonClass} type="submit">{busy ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />}{label ?? (language === "id" ? "Simpan" : "Save")}</button>; }
export function Editor({ title, onClose, onSubmit, busy, children, language, error, submitDisabled = false, submitLabel }: { title: string; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void; busy: boolean; children: ReactNode; language: Language; error?: string; submitDisabled?: boolean; submitLabel?: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close(); }, []);
  return <dialog ref={dialog} aria-modal="true" aria-label={title} className="fixed inset-0 z-50 m-0 h-full max-h-none w-full max-w-none items-center justify-center bg-black/30 p-4 open:flex" onCancel={e => { e.preventDefault(); if (!busy) onClose(); }}>
    <form onSubmit={onSubmit} className="max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-6 shadow-xl">
      <div className="mb-5 flex items-center justify-between gap-3"><h2 className="text-lg font-semibold">{title}</h2><button type="button" onClick={onClose} disabled={busy} aria-label={language === "id" ? "Tutup" : "Close"} title={language === "id" ? "Tutup" : "Close"}><X size={20} /></button></div>
      <div className="space-y-4">{children}</div><Notice error={error} /><div className="mt-6 flex justify-end"><SaveButton busy={busy} language={language} disabled={submitDisabled} label={submitLabel} /></div>
    </form>
  </dialog>;
}

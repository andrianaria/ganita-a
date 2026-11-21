"use client";
import Image from "next/image";
import { useEffect, useState } from "react";
import { Send, X } from "lucide-react";
import { workspace, type Language } from "../lib/workspace-client";
import { Notice, useAction, inputClass, buttonClass } from "./workspace-ui";
type Message = { id: string; prompt: string; result: string | null; status: string; model: string };
export function AssistantPanel({ language, outletId, onClose }: { language: Language; outletId: string; onClose: () => void }) {
  const t = (id: string, en: string) => language === "id" ? id : en, action = useAction(language);
  const [messages, setMessages] = useState<Message[]>([]), [prompt, setPrompt] = useState("");
  const load = async () => setMessages((await workspace<Message[]>(`assistant${outletId ? `?outletId=${outletId}` : ""}`)).reverse());
  useEffect(() => { setMessages([]); void load().catch(e => action.setError(e.message)); }, [outletId]);
  return <section role="dialog" aria-label={t("Tanya Ganita", "Ask Ganita")} className="fixed bottom-24 right-4 z-40 flex max-h-[75dvh] w-[min(430px,calc(100vw-2rem))] flex-col overflow-hidden rounded-lg border border-[#c8e4dc] bg-white shadow-xl">
    <header className="flex items-center gap-3 bg-[#173d34] p-4 text-white"><Image src="/brand/ganita-ai-headshot-transparent.png" alt="" width={36} height={36} /><h2 className="flex-1 font-semibold">{t("Tanya Ganita", "Ask Ganita")}</h2><button title={t("Tutup", "Close")} aria-label={t("Tutup", "Close")} onClick={onClose}><X size={18} /></button></header>
    <div className="min-h-28 overflow-y-auto p-4" aria-live="polite">{!messages.length && <p className="text-sm text-[#587068]">{t("Apa yang ingin kamu periksa dari data outlet?", "What would you like to check in your outlet data?")}</p>}{messages.map(m => <div key={m.id} className="space-y-3 border-b py-4"><p className="font-medium">{m.prompt}</p><p className="whitespace-pre-wrap text-sm leading-6">{m.result ?? (m.status === "FAILED" ? t("Jawaban belum tersedia.", "Answer unavailable.") : t("Jawaban belum selesai. Muat ulang nanti.", "Answer pending. Please reload later."))}</p>{m.status === "PARTIAL" && <p className="text-xs text-amber-700">{t("Jawaban terpotong oleh batas keluaran.", "Response reached its output limit.")}</p>}</div>)}<Notice error={action.error} /></div>
    <form className="flex items-end gap-2 border-t p-3" onSubmit={e => { e.preventDefault(); void action.run(async () => { await workspace("assistant", "POST", { id: crypto.randomUUID(), prompt, outletId: outletId || undefined, language }); setPrompt(""); await load(); }); }}><textarea aria-label={t("Pertanyaan", "Question")} maxLength={2000} required rows={2} className={inputClass} value={prompt} onChange={e => setPrompt(e.target.value)} disabled={action.busy} /><button title={t("Kirim", "Send")} aria-label={t("Kirim", "Send")} className={buttonClass} disabled={action.busy || !prompt.trim()}><Send size={18} /></button></form>
  </section>;
}

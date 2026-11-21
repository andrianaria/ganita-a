"use client";
import { useEffect, useState } from "react";
import { Plug, Store, RefreshCw } from "lucide-react";
import { buttonClass, secondaryClass } from "./workspace-ui";

export function OutletSetupState({ language, onNavigate }: { language: "id" | "en"; onNavigate?: (view: "integrations" | "outlets") => void }) {
  const [connections, setConnections] = useState<number | null>(null);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  const t = (id: string, en: string) => language === "id" ? id : en;
  useEffect(() => {
    const controller = new AbortController();
    setError(false); setConnections(null);
    void fetch("/api/integrations/api-keys", { signal: controller.signal, cache: "no-store" }).then(async response => {
      if (!response.ok) throw new Error("Connection status unavailable");
      const result = await response.json();
      if (!Array.isArray(result.data)) throw new Error("Invalid connection response");
      if (!controller.signal.aborted) setConnections(result.data.filter((key: { revokedAt: string | null }) => !key.revokedAt).length);
    }).catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [revision]);
  return <div className="space-y-4 border-y border-[#dce7e2] py-8">
    <h2 className="text-xl font-semibold">{connections ? t("Menunggu outlet dari POS/ERP", "Waiting for outlets from your POS/ERP") : t("Belum ada outlet", "No outlets yet")}</h2>
    <p className="max-w-xl text-sm leading-6 text-[#53716a]">{connections
      ? t("API key sudah tersedia. Belum ada outlet yang diterima; skor kesehatan belum tersedia.", "An API key is available. No outlets have been received; health scores are not available yet.")
      : t("Hubungkan POS/ERP atau tambahkan outlet pertama secara manual. Ringkasan kesehatan akan muncul setelah data tersedia.", "Connect your POS/ERP or add your first outlet manually. Health summaries will appear once data is available.")}</p>
    {connections === null && !error && <p role="status" className="text-sm text-[#53716a]">{t("Memeriksa koneksi...", "Checking connections...")}</p>}
    {error && <div role="alert" className="flex items-center gap-3 text-sm text-red-700"><span>{t("Status koneksi belum dapat dimuat.", "Connection status could not be loaded.")}</span><button type="button" className={secondaryClass} title={t("Coba lagi", "Retry")} aria-label={t("Coba lagi", "Retry")} onClick={() => setRevision(n => n + 1)}><RefreshCw size={16} /></button></div>}
    {onNavigate && <div className="flex flex-wrap gap-3"><button className={buttonClass} onClick={() => onNavigate("integrations")}><Plug size={16} />{t("Buka integrasi", "Open integrations")}</button><button className={secondaryClass} onClick={() => onNavigate("outlets")}><Store size={16} />{t("Tambah outlet manual", "Add outlet manually")}</button></div>}
  </div>;
}

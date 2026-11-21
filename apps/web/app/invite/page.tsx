"use client";
import { useEffect, useState } from "react";
import { workspace } from "../../lib/workspace-client";
import { buttonClass, Notice } from "../../components/workspace-ui";
import { BrandLockup } from "../../components/brand-lockup";
export default function InvitationPage() {
  const [token, setToken] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  useEffect(() => { const value = window.location.hash.slice(1) || sessionStorage.getItem("ganita-invitation") || ""; setToken(value); if (value) sessionStorage.setItem("ganita-invitation", value); history.replaceState(null, "", "/invite"); }, []);
  const accept = async () => { setBusy(true); setError(""); try { await workspace("team/accept", "POST", { token }); sessionStorage.removeItem("ganita-invitation"); window.location.assign("/dashboard"); } catch (e) { setError(e instanceof Error ? e.message : "Undangan belum dapat diterima."); setBusy(false); } };
  return <main className="mx-auto max-w-lg space-y-5 px-6 py-20"><BrandLockup /><h1 className="text-2xl font-semibold">Undangan tim GANITA.ai</h1><p>Masuk menggunakan email yang diundang, lalu terima undangan.</p><Notice error={error} /><a className="block underline" href="/sign-in?redirect_url=%2Finvite">Masuk ke akun</a><button disabled={!token || busy} onClick={() => void accept()} className={buttonClass}>{busy ? "Memproses..." : "Terima undangan"}</button></main>;
}

"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Copy, Trash2 } from "lucide-react";
import { OutletsWorkspace } from "./outlets-workspace";
import { workspace, dataUpdated, type Language } from "../lib/workspace-client";
import { Field, Notice, Editor, SaveButton, useAction, inputClass, buttonClass, secondaryClass } from "./workspace-ui";

type Profile = { name: string; businessType: string; timezone: string; currency: string; settings?: { targets?: Record<string, string>; notifications?: Record<string, boolean> } };
type Team = { role: string; members: Array<{ role: string; user: { id: string; name: string; email: string } }>; invitations: Array<{ id: string; email: string; role: string; expiresAt: string }> };
const businessTypes = ["Restoran", "Kafe", "Toko roti", "Pujasera", "Jaringan multi-brand"];
const businessEn = ["Restaurant", "Cafe", "Bakery", "Food court", "Multi-brand group"];
const roleLabels: Record<string, [string, string]> = { OWNER: ["Pemilik", "Owner"], ADMIN: ["Admin", "Admin"], MANAGER: ["Manajer", "Manager"], VIEWER: ["Pembaca", "Viewer"] };
export function SettingsWorkspace({ language }: { language: Language }) {
  const t = (id: string, en: string) => language === "id" ? id : en;
  const router = useRouter(), action = useAction(language), modal = useAction(language);
  const [section, setSection] = useState("company"), [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile>({ name: "", businessType: "Restoran", timezone: "Asia/Jakarta", currency: "IDR" });
  const [team, setTeam] = useState<Team | null>(null), [inviteUrl, setInviteUrl] = useState("");
  const [targets, setTargets] = useState<Record<string, string>>({ foodCost: "40", margin: "24", waste: "5", stockDays: "4" });
  const [notifications, setNotifications] = useState<Record<string, boolean>>({ health: true, stock: true, sales: true });
  const [invite, setInvite] = useState(false);
  const load = async () => {
    const p = await workspace<Profile>("organizations/current"); setProfile(p);
    if (p.settings?.targets) setTargets(p.settings.targets);
    if (p.settings?.notifications) setNotifications(p.settings.notifications);
    setTeam(await workspace<Team>("team"));
  };
  useEffect(() => { load().catch(e => action.setError(e.message)).finally(() => setLoading(false)); }, []);
  const writable = team?.role === "OWNER" || team?.role === "ADMIN";
  const save = () => action.run(async () => {
    await workspace("organizations/current", "PATCH", section === "company" ? { name: profile.name, businessType: profile.businessType, timezone: profile.timezone, currency: profile.currency } : { settings: section === "targets" ? { targets } : { notifications } });
    dataUpdated(); router.refresh();
  });
  return <div className="space-y-5 text-left">
    <p className="text-sm text-[#587068]">{t("Kelola profil perusahaan, lokasi outlet, dan akses tim.", "Manage your company, outlet locations, and team access.")}</p>
    <Notice error={action.error} message={action.message} />
    {loading ? <p role="status">{t("Memuat pengaturan...", "Loading settings...")}</p> : <div className="grid gap-6 lg:grid-cols-[200px_minmax(0,1fr)]">
      <nav aria-label={t("Bagian pengaturan", "Settings sections")} className="flex flex-wrap gap-1 self-start lg:flex-col">{[["company", t("Perusahaan & outlet", "Company & outlets")], ["targets", t("Target kesehatan", "Health targets")], ["team", t("Tim & peran", "Team & roles")], ["notifications", t("Aturan notifikasi", "Alert rules")]].map(([key, label]) => <button key={key} onClick={() => { setSection(key); action.setError(""); action.setMessage(""); }} aria-current={section === key ? "page" : undefined} className={`rounded px-3 py-2 text-left text-sm ${section === key ? "bg-[#dcfff4] font-semibold text-[#087968]" : "hover:bg-white"}`}>{label}</button>)}</nav>
      <section className="min-w-0">
        {section === "company" && <><form onSubmit={e => { e.preventDefault(); void save(); }} className="space-y-5"><fieldset disabled={!writable || action.busy} className="grid gap-4 sm:grid-cols-2">
          <Field label={t("Nama perusahaan", "Company name")}><input className={inputClass} required value={profile.name} onChange={e => setProfile({ ...profile, name: e.target.value })} /></Field>
          <Field label={t("Jenis usaha", "Business type")}><select className={inputClass} value={profile.businessType ?? "Restoran"} onChange={e => setProfile({ ...profile, businessType: e.target.value })}>{businessTypes.map((v, i) => <option value={v} key={v}>{language === "id" ? v : businessEn[i]}</option>)}</select></Field>
          <Field label={t("Zona waktu IANA", "IANA timezone")}><input className={inputClass} required value={profile.timezone} onChange={e => setProfile({ ...profile, timezone: e.target.value })} /></Field>
          <Field label={t("Mata uang", "Currency")}><select className={inputClass} value={profile.currency} onChange={e => setProfile({ ...profile, currency: e.target.value })}>{["IDR", "USD", "SGD", "MYR", "AUD"].map(v => <option key={v}>{v}</option>)}</select></Field>
          </fieldset>{writable && <SaveButton busy={action.busy} language={language} />}</form>
          <div className="mt-8 border-t pt-5"><OutletsWorkspace language={language} /></div></>}

        {section === "targets" && <form onSubmit={e => { e.preventDefault(); void save(); }} className="space-y-5"><fieldset disabled={!writable || action.busy} className="grid gap-4 sm:grid-cols-2">{[["foodCost", t("Batas biaya bahan (%)", "Food cost limit (%)"), 1, 100], ["margin", t("Target margin bersih (%)", "Net margin target (%)"), 0, 100], ["waste", t("Batas bahan terbuang (%)", "Waste limit (%)"), 0, 100], ["stockDays", t("Cakupan stok minimum (hari)", "Minimum stock coverage (days)"), 1, 365]].map(([key, label, min, max]) => <Field key={key} label={String(label)}><input type="number" step="0.1" min={min} max={max} required className={inputClass} value={targets[key]} onChange={e => setTargets({ ...targets, [key]: e.target.value })} /></Field>)}</fieldset>{writable && <SaveButton busy={action.busy} language={language} />}</form>}
        {section === "notifications" && <form onSubmit={e => { e.preventDefault(); void save(); }} className="space-y-5"><fieldset disabled={!writable || action.busy} className="space-y-4">{[["health", t("Masalah kesehatan outlet", "Outlet health issues")], ["stock", t("Risiko persediaan", "Inventory risks")], ["sales", t("Penurunan penjualan", "Sales declines")]].map(([key, label]) => <label key={key} className="flex items-center gap-3 text-sm"><input type="checkbox" checked={notifications[key]} onChange={e => setNotifications({ ...notifications, [key]: e.target.checked })} />{label}</label>)}</fieldset>{writable && <SaveButton busy={action.busy} language={language} />}</form>}
        {section === "team" && <><div className="flex justify-between gap-3"><h2 className="font-semibold">{t("Anggota tim", "Team members")}</h2>{writable && <button className={buttonClass} onClick={() => { modal.setError(""); setInvite(true); }}><Plus size={16} />{t("Undang anggota", "Invite member")}</button>}</div>
          {inviteUrl && <div className="my-4 flex flex-wrap gap-2"><input className={`${inputClass} flex-1`} readOnly aria-label={t("Tautan undangan", "Invitation link")} value={inviteUrl} /><button className={secondaryClass} title={t("Salin tautan", "Copy link")} onClick={() => void action.run(() => navigator.clipboard.writeText(inviteUrl))}><Copy size={16} /></button><p className="w-full text-xs text-[#587068]">{t("Bagikan tautan ini ke email yang diundang. Berlaku 7 hari; email belum dikirim otomatis.", "Share this link with the invited email. Valid for 7 days; email is not sent automatically.")}</p></div>}
          <div className="divide-y">{team?.members.map(member => <div key={member.user.id} className="flex flex-wrap items-center justify-between gap-3 py-4"><div><p className="font-medium">{member.user.name}</p><p className="text-sm text-[#587068]">{member.user.email}</p></div>{team.role === "OWNER" && member.role !== "OWNER" ? <select aria-label={t("Peran anggota", "Member role")} className="rounded border p-2 text-sm" value={member.role} disabled={action.busy} onChange={e => void action.run(async () => { await workspace(`team/members/${member.user.id}`, "PATCH", { role: e.target.value }); await load(); })}>{["ADMIN", "MANAGER", "VIEWER"].map(role => <option key={role} value={role}>{roleLabels[role][language === "id" ? 0 : 1]}</option>)}</select> : <span className="text-sm">{roleLabels[member.role][language === "id" ? 0 : 1]}</span>}</div>)}</div>
          <h3 className="mt-6 font-semibold">{t("Undangan menunggu", "Pending invitations")}</h3>{team?.invitations.map(item => <div key={item.id} className="flex items-center justify-between gap-3 border-b py-3 text-sm"><div>{item.email}<p className="text-xs text-[#587068]">{t("Berlaku hingga", "Expires")} {new Date(item.expiresAt).toLocaleDateString(language === "id" ? "id-ID" : "en-US")}</p></div>{writable && <button title={t("Batalkan undangan", "Revoke invitation")} className={secondaryClass} onClick={() => void action.run(async () => { await workspace(`team/invitations/${item.id}`, "DELETE"); await load(); })}><Trash2 size={16} /></button>}</div>)}</>}
      </section>
    </div>}
    {invite && <Editor language={language} title={t("Undang anggota", "Invite member")} onClose={() => setInvite(false)} busy={modal.busy} error={modal.error} onSubmit={e => { e.preventDefault(); const form = new FormData(e.currentTarget); void modal.run(async () => { const data = await workspace<{ url: string }>("team/invitations", "POST", Object.fromEntries(form)); setInviteUrl(data.url); setInvite(false); await load(); }); }}><Field label="Email"><input autoFocus type="email" name="email" required className={inputClass} /></Field><Field label={t("Peran", "Role")}><select name="role" className={inputClass} defaultValue="VIEWER">{(team?.role === "OWNER" ? ["VIEWER", "MANAGER", "ADMIN"] : ["VIEWER", "MANAGER"]).map(role => <option key={role} value={role}>{roleLabels[role][language === "id" ? 0 : 1]}</option>)}</select></Field></Editor>}
  </div>;
}

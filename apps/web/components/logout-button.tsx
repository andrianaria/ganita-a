"use client";
import { useClerk } from "@clerk/nextjs";
import { useState } from "react";

function Button({ name, language, signOut }: { name: string; language: "id" | "en"; signOut?: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const logout = async () => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/logout", { method: "POST" });
      if (signOut) await signOut();
      else if (!response.ok) throw new Error("Sesi server belum dapat ditutup.");
      window.location.replace("/");
    } catch {
      setError(language === "id" ? "Gagal keluar. Silakan coba lagi." : "Sign out failed. Please try again.");
      setBusy(false);
    }
  };
  const label = language === "id" ? "Keluar" : "Sign out";
  return <div><button disabled={busy} onClick={() => void logout()} title={label} aria-label={label} className="flex h-9 w-9 items-center justify-center rounded-full bg-[#183c34] text-sm font-semibold text-white disabled:opacity-50">{busy ? "..." : name.slice(0, 2).toUpperCase()}</button>{error && <p role="alert" className="text-xs text-red-700">{error}</p>}</div>;
}
function ClerkLogout({ name, language }: { name: string; language: "id" | "en" }) {
  const { signOut } = useClerk();
  return <Button name={name} language={language} signOut={() => signOut()} />;
}
export function LogoutButton({ name, language = "id" }: { name: string; language?: "id" | "en" }) {
  return process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ? <ClerkLogout name={name} language={language} /> : <Button name={name} language={language} />;
}

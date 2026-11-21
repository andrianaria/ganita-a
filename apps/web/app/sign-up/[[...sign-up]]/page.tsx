import Link from "next/link";
import { SignUp } from "@clerk/nextjs";
import { BrandLockup } from "../../../components/brand-lockup";

export default function Page() {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-mint px-5">
        <section className="w-full max-w-md rounded border border-teal/15 bg-white p-6 shadow-panel">
          <BrandLockup />
          <h1 className="mt-2 text-2xl font-semibold">Clerk belum aktif di localhost</h1>
          <p className="mt-3 text-sm leading-6 text-ink/68">Clerk production hanya menerima domain `kuatdigital.com`. Untuk menguji Google sign up di localhost, gunakan Clerk development key.</p>
          <Link href="/dev-login" className="mt-5 inline-flex w-full items-center justify-center rounded bg-ink px-4 py-3 text-sm font-semibold text-aqua">
            Pakai demo Kuatdigital
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-mint px-5 py-8">
      <BrandLockup />
      <SignUp routing="path" path="/sign-up" signInUrl="/sign-in" fallbackRedirectUrl="/onboarding" />
    </main>
  );
}

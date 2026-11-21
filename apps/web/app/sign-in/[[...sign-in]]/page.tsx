import Link from "next/link";
import { SignIn } from "@clerk/nextjs";
import { BrandLockup } from "../../../components/brand-lockup";

export default function Page() {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-mint px-5">
        <section className="w-full max-w-md rounded border border-teal/15 bg-white p-6 shadow-panel">
          <BrandLockup />
          <h1 className="mt-2 text-2xl font-semibold">Clerk belum aktif di localhost</h1>
          <p className="mt-3 text-sm leading-6 text-ink/68">
            Clerk production hanya menerima domain `kuatdigital.com`. Untuk menguji Google login di localhost, gunakan Clerk development key. Sementara itu, login Kuatdigital tetap aktif.
          </p>
          <Link href="/dev-login" className="mt-5 inline-flex w-full items-center justify-center rounded bg-ink px-4 py-3 text-sm font-semibold text-aqua">
            Masuk sebagai Kuatdigital
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-mint px-5 py-8">
      <BrandLockup />
      <SignIn routing="path" path="/sign-in" signUpUrl="/sign-up" fallbackRedirectUrl="/dashboard" />
    </main>
  );
}

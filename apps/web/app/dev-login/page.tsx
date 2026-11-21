import Link from "next/link";
import { BrandLockup } from "../../components/brand-lockup";

export default async function DevLoginPage({ searchParams }: { searchParams: Promise<{ error?: string; success?: string }> }) {
  const params = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top_left,#e9fffa_0,#f7faf7_44%,#eef5f4_100%)] px-5">
      <section className="w-full max-w-md rounded border border-teal/15 bg-white p-6 shadow-panel">
        <BrandLockup />
        <h1 className="mt-2 text-3xl font-semibold">Login Ganita</h1>
        <p className="mt-3 text-sm leading-6 text-ink/68">Masukkan akun development yang disiapkan pada layanan autentikasi lokal.</p>
        <form action="/api/dev-login" method="post" className="mt-6 grid gap-4">
          <label className="grid gap-2 text-sm font-medium">
            Email
            <input className="rounded border border-line bg-field px-3 py-3 outline-none focus:border-teal" name="email" type="email" defaultValue="" />
          </label>
          <label className="grid gap-2 text-sm font-medium">
            Password
            <input className="rounded border border-line bg-field px-3 py-3 outline-none focus:border-teal" name="password" type="password" defaultValue="" />
          </label>
          <button className="rounded bg-ink px-4 py-3 text-sm font-semibold text-aqua">Masuk</button>
        </form>
        {params.success ? <p className="mt-4 rounded border border-teal/15 bg-mint p-3 text-sm text-ink/72">Login Ganita berhasil.</p> : null}
        {params.error ? <p className="mt-4 rounded border border-coral/25 bg-coral/10 p-3 text-sm text-coral">{decodeURIComponent(params.error)}</p> : null}
        <Link className="mt-5 inline-flex text-sm font-semibold text-teal" href="/">
          Kembali ke halaman login
        </Link>
      </section>
    </main>
  );
}

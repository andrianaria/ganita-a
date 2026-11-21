import { NextResponse } from "next/server";

const apiBaseUrl = process.env.API_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

export async function POST(request: Request) {
  const formData = await request.formData();
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  try {
    const response = await fetch(`${apiBaseUrl}/v1/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password })
    });
    const payload = await response.json();

    if (!response.ok || !payload?.data?.token) {
      const message = encodeURIComponent(payload?.error?.message ?? "Login gagal.");
      return NextResponse.redirect(new URL(`/dev-login?error=${message}`, request.url), 303);
    }

    const redirect = NextResponse.redirect(new URL("/dashboard?login=kuatdigital", request.url), 303);
    redirect.cookies.set("ganita_ai_token", payload.data.token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 12
    });
    return redirect;
  } catch (error) {
    const message = encodeURIComponent(error instanceof Error ? error.message : "Login gagal.");
    return NextResponse.redirect(new URL(`/dev-login?error=${message}`, request.url), 303);
  }
}

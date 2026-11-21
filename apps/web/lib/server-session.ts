import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function sessionToken() {
  // Never fall back to another account's cookie when Clerk is enabled.
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (publishableKey || secretKey) {
    if (!publishableKey || !secretKey) return null;
    return (await auth()).getToken();
  }
  return (await cookies()).get("ganita_ai_token")?.value ?? null;
}

export async function apiRequest(path: string, init: RequestInit = {}) {
  const token = await sessionToken();
  if (!token) return Response.json({ error: { code: "UNAUTHORIZED", message: "Sesi login tidak ditemukan. Silakan masuk kembali." } }, { status: 401 });
  const body = init.body === "" || init.body == null ? undefined : init.body;
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  // Fastify rejects an empty request advertised as JSON before reaching the route.
  if (body === undefined) headers.delete("Content-Type");
  else if (!headers.has("Content-Type") && typeof body === "string") headers.set("Content-Type", "application/json");
  return fetch(`${process.env.API_BASE_URL ?? "http://localhost:4000"}${path}`, {
    ...init, body, headers, cache: "no-store",
  });
}

export async function proxyApi(path: string, request?: Request, method = "GET") {
  try {
    const response = await apiRequest(path, { method, body: request && method !== "GET" ? await request.text() : undefined });
    return NextResponse.json(await response.json(), { status: response.status });
  } catch {
    return NextResponse.json({ error: { message: "Server belum dapat dihubungi. Silakan coba lagi." } }, { status: 502 });
  }
}

import { NextResponse } from "next/server";
import { apiRequest } from "../../../lib/server-session";

export async function POST() {
  let ok = false;
  try {
    const result = await apiRequest("/v1/auth/logout", { method: "POST" });
    ok = result.ok || [401, 403, 409].includes(result.status);
  } catch { /* Clear browser credentials even when the backend is unavailable. */ }
  const response = NextResponse.json({ ok }, { status: ok ? 200 : 503 });
  for (const name of ["ganita_ai_token", "ganita_onboarding"]) {
    response.cookies.delete(name);
  }
  return response;
}

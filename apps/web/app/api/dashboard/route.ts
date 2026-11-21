import { proxyApi } from "../../../lib/server-session";
export async function GET(request: Request) {
  const input = new URL(request.url).searchParams;
  const query = new URLSearchParams();
  for (const key of ["outletId", "from", "to"]) if (input.get(key)) query.set(key, input.get(key)!);
  return proxyApi(`/v1/dashboard?${query}`);
}

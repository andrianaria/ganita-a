import { proxyApi } from "../../../lib/server-session";
export async function GET() { return proxyApi("/v1/organizations/current"); }
export async function PATCH(request: Request) { return proxyApi("/v1/organizations/current", request, "PATCH"); }

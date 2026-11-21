import { proxyApi } from "../../../../lib/server-session";
export async function GET() { return proxyApi("/v1/api-keys"); }
export async function POST(request: Request) { return proxyApi("/v1/api-keys", request, "POST"); }

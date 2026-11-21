import { proxyApi } from "../../../../lib/server-session";
export async function POST(request: Request) { return proxyApi("/v1/imports/csv/transactions", request, "POST"); }

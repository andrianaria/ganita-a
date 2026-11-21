import { apiRequest } from "../../../../lib/server-session";

const allowed = /^(?:organizations\/current|outlets(?:\/[\w-]+)?|brands|team(?:\/(?:invitations(?:\/[\w-]+)?|accept|members\/[\w-]+))?|products(?:\/[\w-]+(?:\/recipe)?)?|ingredients(?:\/[\w-]+)?|recipes|stock-locations|stock-balances|stock-movements|data-sources(?:\/[\w-]+(?:\/(?:test|mappings|sync-jobs|jobs\/[\w-]+\/retry))?)?|inspections|treatments(?:\/[\w-]+)?|expenses(?:\/[\w-]+)?|reports\/export|assistant)$/;
async function handle(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const path = (await context.params).path.join("/");
  if (!allowed.test(path) && path !== "alerts") return Response.json({ error: { message: "Not found" } }, { status: 404 });
  try {
    const response = await apiRequest(`/v1/${path}${new URL(request.url).search}`, {
      method: request.method, body: ["GET", "HEAD"].includes(request.method) ? undefined : await request.text(),
    });
    return new Response(response.body, { status: response.status, headers: {
      "Content-Type": response.headers.get("Content-Type") ?? "application/json",
      "Cache-Control": "no-store",
      ...(response.headers.has("Content-Disposition") ? { "Content-Disposition": response.headers.get("Content-Disposition")! } : {}),
    } });
  } catch { return Response.json({ error: { message: "Server belum dapat dihubungi." } }, { status: 502 }); }
}
export { handle as GET, handle as POST, handle as PATCH, handle as PUT, handle as DELETE };

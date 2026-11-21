import { proxyApi } from "../../../../../../lib/server-session";
export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return proxyApi(`/v1/api-keys/${encodeURIComponent(id)}/revoke`, undefined, "POST");
}

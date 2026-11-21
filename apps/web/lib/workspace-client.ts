export type Language = "id" | "en";
export async function workspace<T>(path: string, method = "GET", data?: unknown): Promise<T> {
  const response = await fetch(`/api/workspace/${path}`, { method, headers: { "Content-Type": "application/json" }, body: data === undefined ? undefined : JSON.stringify(data), cache: "no-store" });
  const result = await response.json();
  if (!response.ok) {
    const details = result.error?.details?.issues as Array<{ path: string[]; message: string }> | undefined;
    throw new Error(details?.map(issue => `${issue.path.join(".")}: ${issue.message}`).join("; ") || result.error?.message || `HTTP ${response.status}`);
  }
  return result.data as T;
}
export function dataUpdated() { window.dispatchEvent(new Event("ganita-data-updated")); }

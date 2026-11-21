const api = process.env.API_BASE_URL ?? "http://localhost:4000";
const web = process.env.APP_BASE_URL ?? "http://localhost:3000";
let failed = false;
for (const [name, url] of [["api-live", `${api}/health`], ["api-ready", `${api}/ready`], ["public-docs", `${web}/docs/api`]]) {
  const start = Date.now();
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(10000), redirect: "manual" });
    const ok = response.status === 200;
    console.log(JSON.stringify({ check: name, ok, status: response.status, elapsedMs: Date.now() - start, timestamp: new Date().toISOString() }));
    if (!ok) failed = true;
  } catch { failed = true; console.log(JSON.stringify({ check: name, ok: false, error: "unreachable", timestamp: new Date().toISOString() })); }
}
process.exitCode = failed ? 1 : 0;

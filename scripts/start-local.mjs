import { existsSync, readFileSync, writeFileSync, mkdirSync, openSync, closeSync } from "node:fs";
import { parseEnv } from "node:util";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const configPath = new URL("../.env.local", import.meta.url);
const env = { ...(existsSync(configPath) ? parseEnv(readFileSync(configPath, "utf8")) : {}), ...process.env, NODE_ENV: "development" };
const canBind = (port, host) => new Promise(resolve => { const server = createServer(); server.once("error", () => resolve(false)); server.listen(port, host, () => server.close(() => resolve(true))); });
const free = async port => (await canBind(port, "0.0.0.0")) && (await canBind(port, "::"));
mkdirSync(new URL("../.local", import.meta.url), { recursive: true, mode: 0o700 });
for (const [name, port, args] of [["api", 4000, ["--filter", "@ganita-ai/api", "dev"]], ["web", 3000, ["--filter", "@ganita-ai/web", "dev"]]]) {
  if (!(await free(port))) { console.log(`${name}: port ${port} is already in use; existing process was left untouched.`); continue; }
  const log = openSync(new URL(`../.local/${name}.log`, import.meta.url), "a", 0o600);
  const child = spawn("pnpm", args, { cwd: root, env, detached: true, stdio: ["ignore", log, log] });
  child.unref(); closeSync(log); console.log(`${name}: starting on ${port} (PID ${child.pid}). Logs: .local/${name}.log`);
}
console.log("Run pnpm ops:check after startup. The server requires the local PostgreSQL service.");
const workerPidPath = new URL("../.local/worker.pid", import.meta.url);
let workerRunning = false;
if (existsSync(workerPidPath)) {
  const pid = Number(readFileSync(workerPidPath, "utf8"));
  if (Number.isInteger(pid) && pid > 0) { try { process.kill(pid, 0); workerRunning = true; } catch {} }
}
if (workerRunning) console.log("worker: saved process is still running; left untouched.");
else {
  const log = openSync(new URL("../.local/worker.log", import.meta.url), "a", 0o600);
  const child = spawn("pnpm", ["--filter", "@ganita-ai/worker", "dev"], { cwd: root, env, detached: true, stdio: ["ignore", log, log] });
  child.unref(); closeSync(log);
  writeFileSync(workerPidPath, String(child.pid), { mode: 0o600 });
  console.log(`worker: starting (PID ${child.pid}). Logs: .local/worker.log`);
}

import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";

const localPath = new URL("../.env.local", import.meta.url);
const local = existsSync(localPath) ? parseEnv(readFileSync(localPath, "utf8")) : {};
const config = { ...local, ...process.env };
if (!config.DATABASE_URL) throw new Error("Set DATABASE_URL to a local PostgreSQL database.");
const url = new URL(config.DATABASE_URL);
if (!["localhost", "127.0.0.1"].includes(url.hostname)) throw new Error("Regression runner requires a local database.");
const schema = `ganita_test_${randomBytes(8).toString("hex")}`;
url.searchParams.set("schema", schema);
const env = { ...config, DATABASE_URL: url.href, NODE_ENV: "test", LOG_LEVEL: "silent", GANITA_TEST_DATABASE: "1" };
// Config uses Fastify log-level names; keep test output minimal.
env.LOG_LEVEL = "fatal";
const run = (args, input) => spawnSync("pnpm", args, { env, input, stdio: input ? ["pipe", "inherit", "inherit"] : "inherit", cwd: new URL("../", import.meta.url) }).status ?? 1;
let status = 1;
try {
  status = run(["--filter", "@ganita-ai/database", "db:deploy"]);
  if (!status) status = run(["--filter", "@ganita-ai/api", "exec", "vitest", "run", "--config", "vitest.integration.config.ts"]);
} finally {
  const cleanup = run(["--filter", "@ganita-ai/database", "exec", "prisma", "db", "execute", "--schema", "prisma/schema.prisma", "--stdin"], `DROP SCHEMA "${schema}" CASCADE;`);
  if (cleanup) status = cleanup;
}
process.exit(status);

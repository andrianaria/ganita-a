import { existsSync, readFileSync, mkdirSync, chmodSync, openSync, closeSync, unlinkSync } from "node:fs";
import { parseEnv } from "node:util";
import { spawnSync } from "node:child_process";
import { resolve, join } from "node:path";
const localPath = new URL("../.env.local", import.meta.url);
const config = { ...(existsSync(localPath) ? parseEnv(readFileSync(localPath, "utf8")) : {}), ...process.env };
if (!config.DATABASE_URL) throw Error("DATABASE_URL is required.");
const url = new URL(config.DATABASE_URL);
const env = { ...process.env, PGHOST: url.hostname, PGPORT: url.port || "5432", PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password), PGDATABASE: url.pathname.slice(1), PGSSLMODE: url.searchParams.get("sslmode") || "prefer" };
const run = (cmd, args, io = {}) => {
  const executable = config.PG_BIN ? join(config.PG_BIN, cmd) : cmd;
  if (config.PG_CONTAINER && !["localhost", "127.0.0.1"].includes(url.hostname)) throw Error("Container tools are restricted to localhost.");
  const command = config.PG_CONTAINER ? "docker" : executable;
  const commandArgs = config.PG_CONTAINER ? ["exec", "-i", "-e", "PGUSER", "-e", "PGPASSWORD", "-e", "PGDATABASE", config.PG_CONTAINER, cmd, ...args] : args;
  const result = spawnSync(command, commandArgs, { env, stdio: [io.input ?? "inherit", io.output ?? "inherit", "inherit"] });
  if (result.error) throw result.error;
  if (result.status) throw Error(`${cmd} failed with exit ${result.status}`);
};
if (process.argv[2] === "backup") {
  const directory = resolve(".backups"); mkdirSync(directory, { recursive: true, mode: 0o700 });
  const path = resolve(directory, `ganita-${new Date().toISOString().replace(/[:.]/g, "-")}.dump`);
  process.umask(0o077);
  const file = openSync(path, "wx", 0o600);
  try { run("pg_dump", ["--format=custom", "--no-owner", "--no-acl"], { output: file }); }
  catch (error) { unlinkSync(path); throw error; }
  finally { closeSync(file); }
  chmodSync(path, 0o600);
  const input = openSync(path, "r");
  try { run("pg_restore", ["--list"], { input, output: "ignore" }); } finally { closeSync(input); }
  console.log(`Backup verified: ${path}`);
} else if (process.argv[2] === "restore-test") {
  if (!["localhost", "127.0.0.1"].includes(url.hostname)) throw Error("Restore test only runs on localhost.");
  const path = resolve(process.argv[3] || ""); if (!existsSync(path) || !path.endsWith(".dump")) throw Error("Provide a .dump file.");
  const database = `ganita_restore_${Date.now()}`;
  // Restore only into a new database. Never overwrite the configured application database.
  run("createdb", [database]);
  const input = openSync(path, "r");
  try { run("pg_restore", ["--exit-on-error", "--no-owner", "--no-acl", "--dbname", database], { input }); } finally { closeSync(input); }
  run("psql", ["--dbname", database, "--no-psqlrc", "--command", "SELECT count(*) AS organizations FROM public.organizations; SELECT count(*) AS outlets FROM public.outlets; SELECT count(*) AS transactions FROM public.transactions;"]);
  console.log(`Restored and checked ${database}. Kept for inspection; remove it manually after verification.`);
} else throw Error("Use backup or restore-test <file.dump>.");

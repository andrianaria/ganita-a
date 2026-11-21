import { randomBytes as createTestBytes } from "node:crypto";
const testCredential1 = createTestBytes(32).toString("hex");
const testCredential2 = createTestBytes(32).toString("hex");
import { describe, expect, it } from "vitest";
import { loadConfig } from "./index";
const base = { DATABASE_URL: "postgresql://localhost:1/example", JWT_SECRET: testCredential1 };
describe("configuration validation", () => {
  it("uses local defaults without reading credentials", () => {
    expect(loadConfig(base)).toMatchObject({ NODE_ENV: "development", DEFAULT_TIMEZONE: "Asia/Jakarta", DEFAULT_CURRENCY: "IDR", LLM_PROVIDER: "mock", API_BASE_URL: "http://localhost:4000" });
  });
  it("accepts explicit deployment values", () => {
    expect(loadConfig({ ...base, NODE_ENV: "production", API_BASE_URL: "https://example.test", LOG_LEVEL: "error", LLM_PROVIDER: "remote" })).toMatchObject({ NODE_ENV: "production", LOG_LEVEL: "error", LLM_PROVIDER: "remote" });
  });
  it.each([{ DATABASE_URL: "" }, { JWT_SECRET: testCredential2.slice(0, 8) }, { NODE_ENV: "unknown" }, { LOG_LEVEL: "silent" }, { API_BASE_URL: "not-a-url" }, { LLM_PROVIDER: "unknown" }])("rejects invalid configuration %j", override => {
    expect(() => loadConfig({ ...base, ...override })).toThrow();
  });
});

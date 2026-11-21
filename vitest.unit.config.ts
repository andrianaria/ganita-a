import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["packages/**/*.test.ts", "apps/**/*.unit.test.ts", "apps/web/lib/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/*.integration.test.ts"],
    setupFiles: ["./tests/setup.ts"],
    clearMocks: true,
    restoreMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov", "json-summary"],
      reportsDirectory: "coverage/unit",
      include: [
        "packages/{config,domain,shared,normalization,health-engine,insights}/src/**/*.ts",
        "packages/database/src/metrics.ts",
        "packages/connectors/csv/src/index.ts",
        "apps/api/src/{auth,tenant,validation,dashboard,ingest}.ts",
        "apps/worker/src/worker.ts",
        "apps/web/lib/{csv-import,server-session}.ts",
        "apps/web/app/api/{logout,dashboard}/route.ts",
      ],
      thresholds: { lines: 90, statements: 90, functions: 90, branches: 80 },
    },
  },
});

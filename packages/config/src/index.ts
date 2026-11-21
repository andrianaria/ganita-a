import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_ENV: z.string().default("local"),
  APP_BASE_URL: z.string().url().default("http://localhost:3000"),
  API_BASE_URL: z.string().url().default("http://localhost:4000"),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(24),
  CLERK_SECRET_KEY: z.string().optional(),
  ASSISTANT_API_KEY: z.string().optional(),
  ASSISTANT_MODEL: z.string().optional(),
  ASSISTANT_API_URL: z.string().url().optional(),
  AWS_REGION: z.string().default("ap-southeast-1"),
  S3_IMPORT_BUCKET: z.string().optional(),
  SQS_SYNC_QUEUE_URL: z.string().optional(),
  SQS_HEALTH_QUEUE_URL: z.string().optional(),
  SQS_INSIGHT_QUEUE_URL: z.string().optional(),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),
  DEFAULT_TIMEZONE: z.string().default("Asia/Jakarta"),
  DEFAULT_CURRENCY: z.string().default("IDR"),
  LLM_PROVIDER: z.enum(["mock", "remote", "anthropic"]).default("mock")
});

export type AppConfig = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return schema.parse(env);
}

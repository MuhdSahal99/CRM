import { z } from "zod";

// Every runtime setting comes from here; a bad environment stops the process at boot (TRD § Environments).
// Dev-only relaxations would be typed flags in this schema, marked `// TEMP-DEV: <id>` (none exist).
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }), // crm_app: no BYPASSRLS, no DDL (ADR-0003)
  REDIS_URL: z.url({ protocol: /^rediss?$/ }),
  DATABASE_AUTH_URL: z.url({ protocol: /^postgres(ql)?$/ }), // crm_auth: Better Auth's tables only (ADR-0004)
  BETTER_AUTH_SECRET: z.string().min(32), // signs session cookies
  BETTER_AUTH_URL: z.url({ protocol: /^https?$/ }), // the app's public origin; also the trusted origin for CSRF checks
  // Object storage (ADR-0012): MinIO in dev, an S3 bucket in prod. Optional at boot; storage.ts refuses to run without them.
  S3_ENDPOINT: z.url().optional(), // set for MinIO; omit for AWS
  S3_REGION: z.string().min(1).default("us-east-1"),
  S3_BUCKET: z.string().min(3).optional(),
  S3_ACCESS_KEY_ID: z.string().min(1).optional(),
  S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  SMTP_PASSWORD: z.string().min(1).optional(), // dev stand-in for the Secrets Manager secret behind org_settings.smtp_secret_ref
  SMTP_PASSWORD_HOST: z.string().min(1).optional(), // the only SMTP host that receives SMTP_PASSWORD: an org's own smtp_host never gets a global credential
  // TEMP-DEV: smtp-private-hosts lets an org's smtp_host be loopback/private and on any port (Mailpit on 127.0.0.1:1025); refused in production.
  ALLOW_PRIVATE_SMTP: z.enum(["true", "false"]).default("false").transform((v) => v === "true"),
  CHROMIUM_PATH: z.string().min(1).optional(), // the worker's pinned Chromium for PDFs (ADR-0010)
});

const productionSafe = envSchema.refine((c) => !(c.NODE_ENV === "production" && c.ALLOW_PRIVATE_SMTP), { path: ["ALLOW_PRIVATE_SMTP"], message: "must not be true in production" });

export type Config = z.infer<typeof envSchema>;

export function parseConfig(env: Record<string, string | undefined>): Config {
  const result = productionSafe.safeParse(env);
  if (result.success) return result.data;
  // Names and messages only: values may hold credentials.
  const problems = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
  throw new Error(`Invalid environment: ${problems.join("; ")}`);
}

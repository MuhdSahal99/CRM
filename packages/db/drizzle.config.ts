import { defineConfig } from "drizzle-kit";

// Generates reviewed SQL into ./migrations (ADR-0002). Hand-written SQL (RLS, grants, triggers) uses `generate --custom`.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema",
  out: "./migrations",
  casing: "snake_case",
});

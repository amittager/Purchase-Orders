import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// `next dev` reads `.env.local` automatically; drizzle-kit is a plain CLI
// process, so we load the same file explicitly to keep one source of truth
// for DATABASE_URL. Falls back to `.env` if `.env.local` isn't present.
config({ path: ".env.local" });
config();

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not set. Copy .env.example to .env.local and fill in your Neon connection string.",
  );
}

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  strict: true,
  verbose: true,
});
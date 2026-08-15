/**
 * One-off script to populate `allowed_approvers`. Run with `npm run db:seed`
 * after setting SEED_APPROVER_EMAILS in .env.local. Deliberately reads
 * process.env directly (not lib/env.ts) so seeding only requires
 * DATABASE_URL — not AWS/Google/PDF-signing credentials — which is useful
 * the first time you're standing the database up.
 */
import { neon } from "@neondatabase/serverless";
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/neon-http";

import { allowedApprovers } from "./schema";

config({ path: ".env.local" });
config();

const approverEmails = (process.env.SEED_APPROVER_EMAILS ?? "")
  .split(",")
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env.local and fill in your Neon connection string.",
    );
  }
  if (approverEmails.length === 0) {
    console.log(
      "No SEED_APPROVER_EMAILS set — nothing to seed.\n" +
        "Add SEED_APPROVER_EMAILS=manager1@example.com,manager2@example.com to .env.local and re-run `npm run db:seed`.",
    );
    return;
  }

  const sql = neon(process.env.DATABASE_URL);
  const db = drizzle(sql);

  for (const email of approverEmails) {
    await db
      .insert(allowedApprovers)
      .values({ email })
      .onConflictDoNothing({ target: allowedApprovers.email });
    console.log(`Approver allowed: ${email}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
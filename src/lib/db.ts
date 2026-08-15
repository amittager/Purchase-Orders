import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

import * as schema from "@/db/schema";
import { env } from "@/lib/env";

/**
 * Neon's HTTP driver — each query is a single fetch() call instead of a
 * persistent TCP connection, which is what makes this safe to use from
 * serverless/edge route handlers and server components without a
 * connection-pool exhaustion problem. If you later need transactions or
 * LISTEN/NOTIFY, switch this file to `@neondatabase/serverless`'s Pool +
 * `drizzle-orm/neon-serverless` — nothing outside this file needs to change.
 */
const sql = neon(env.DATABASE_URL);

export const db = drizzle(sql, { schema });
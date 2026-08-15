@AGENTS.md

## Project overview

Procurement Order Management App — Next.js App Router + NextAuth (Google) +
Neon Postgres (Drizzle) + AWS S3 + PDF approval receipts stamped with an
"APPROVED" icon. See [README.md](./README.md) for setup and architecture
notes.

Key conventions used throughout this codebase:

- **Reads** are plain `async` Server Components calling functions in
  `src/lib/orders.ts` directly — no REST layer for GETs.
- **Writes** are Server Actions in `src/lib/actions/*.ts` (`"use server"`),
  invoked from `<form action={...}>` with `useActionState` on the client
  side for pending/error state.
- **Route Handlers** (`src/app/api/**/route.ts`) exist only for the
  NextAuth catch-all and the two presigned-download redirects — not for
  CRUD.
- Authorization = membership in the `allowed_approvers` table
  (`src/lib/auth.ts` → `isAuthorizedApprover`), not a role stored on the
  user. `src/proxy.ts` enforces route-level access; pages re-check via
  `requireUser()`/`requireApprover()` as defense in depth.
- Env vars are accessed only through `src/lib/env.ts` (`env.FOO`), never
  `process.env.FOO` directly in app code — it validates and gives a clear
  error instead of an obscure `undefined` failure three layers down.
# Procurement Order Management

A standalone procurement order management app: employees submit purchase
requests with a price quote, authorized managers approve or reject them, and
every approval stamps the requester's own quote file with an "APPROVED" icon
+ sign-off date — converting it to PDF first if it wasn't one already — and
stores the result in S3 as the approval receipt.

- **Framework:** Next.js 16 (App Router, TypeScript, Turbopack)
- **Auth:** NextAuth.js (Auth.js) v5, Google provider only
- **Database:** Neon Postgres via Drizzle ORM (`@neondatabase/serverless` HTTP driver)
- **Storage:** AWS S3 (uploaded quotes + PDF receipts, both private, accessed via short-lived presigned URLs)
- **PDF:** `pdf-lib` (+ `@pdf-lib/fontkit`) loads the requester's quote file (or a PDF wrapper around it — see below) and stamps `public/sign.png` (an "APPROVED" icon) + the sign-off date onto its last page. Word/Excel quote files are converted to PDF first via `libreoffice-convert` (requires LibreOffice installed on the host — see "Approval receipt" below).
- **UI:** Tailwind CSS + shadcn/ui (`base-nova` style, Base UI primitives) + Lucide icons

## Getting started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

```bash
cp .env.example .env.local
```

Fill in `.env.local`:

| Variable | Where to get it |
| --- | --- |
| `DATABASE_URL` | [Neon console](https://console.neon.tech) → your project → Connection string (must include `?sslmode=require`) |
| `NEXTAUTH_SECRET` | `npx auth secret` or `openssl rand -base64 33` |
| `NEXTAUTH_URL` | `http://localhost:3000` locally; your deployed URL in production |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | [Google Cloud Console](https://console.cloud.google.com/apis/credentials) → OAuth 2.0 Client ID (Web application). Authorized redirect URI: `<NEXTAUTH_URL>/api/auth/callback/google` |
| `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_S3_BUCKET_NAME` | An S3 bucket + an IAM user/role scoped to `s3:PutObject`/`s3:GetObject` on that bucket. Keep the bucket private — files are only ever served via short-lived presigned URLs (see `src/lib/s3.ts`). |

`src/lib/env.ts` validates all of these at first use and fails fast with a
readable message if anything is missing.

**S3 CORS (required):** the quote file is uploaded straight from the
browser to S3 via a presigned PUT URL (`requestQuoteUploadUrl` in
`lib/actions/orders.ts`) — needed so the file's bytes don't have to pass
through this app's server, which serverless hosts (e.g. Vercel) cap well
under this app's 15MB upload limit. That means the bucket needs a CORS
configuration allowing `PUT` from wherever the app is served, or the
browser upload fails with a CORS error. In the S3 console → your bucket →
Permissions → Cross-origin resource sharing (CORS):

```json
[
  {
    "AllowedOrigins": ["http://localhost:3000", "https://your-deployed-domain.example"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["*"]
  }
]
```

Update `AllowedOrigins` whenever the deployed domain changes.

### 3. Create the database schema

```bash
npm run db:generate   # (already run once — drizzle/0000_*.sql is committed)
npm run db:migrate    # applies migrations to DATABASE_URL
```

(`npm run db:push` is also available for quick iteration without migration
files, but prefer `generate` + `migrate` once you're past initial setup.)

### 4. Authorize your first approver(s)

Membership in `allowed_approvers` — not any role on the user — is what lets
someone approve/reject orders (see `src/lib/auth.ts`). Seed it:

```bash
# in .env.local:
SEED_APPROVER_EMAILS="manager1@example.com,manager2@example.com"

npm run db:seed
```

### 5. Run it

```bash
npm run dev
```

Visit `http://localhost:3000`, sign in with Google, and submit an order. Sign
in with an email listed in `allowed_approvers` to see **All Pending
Approvals** in the nav and approve/reject orders.

## Architecture

```
src/
├─ proxy.ts                     # route protection (Next 16's `middleware` → `proxy`)
├─ app/
│  ├─ layout.tsx                # header + toaster shell
│  ├─ page.tsx                  # landing / sign-in
│  ├─ login/page.tsx
│  ├─ orders/
│  │  ├─ page.tsx               # "My Orders" — requester's own orders
│  │  ├─ new/page.tsx           # "New Order" form
│  │  └─ [id]/page.tsx          # order detail + approve/reject + activity log
│  ├─ approvals/page.tsx        # "All Pending Approvals" — approvers only
│  └─ api/
│     ├─ auth/[...nextauth]/route.ts
│     └─ orders/[id]/{quote,receipt}/route.ts   # presigned-URL redirects
├─ components/
│  ├─ nav/                      # header, active-link nav
│  ├─ orders/                   # form, table, status badge, decision form
│  └─ ui/                       # shadcn/ui primitives
├─ db/
│  ├─ schema.ts                 # Drizzle schema (see below)
│  └─ seed.ts                   # seeds allowed_approvers
├─ lib/
│  ├─ env.ts                    # validated env access
│  ├─ db.ts                     # Drizzle + Neon HTTP client
│  ├─ auth.ts                   # NextAuth config + isAuthorizedApprover/requireUser/requireApprover
│  ├─ s3.ts                     # upload + download (buffer) + presigned upload/download URLs
│  ├─ office-convert.ts         # Word/Excel → PDF via LibreOffice
│  ├─ receipt-pdf.ts            # stamps the requester's quote file with the "APPROVED" icon
│  ├─ orders.ts                 # data access layer (reads, shared helpers)
│  ├─ format.ts                 # currency/date formatting
│  └─ actions/
│     ├─ auth.ts                # sign-in/out Server Actions
│     └─ orders.ts              # createOrder / approveOrder / rejectOrder Server Actions
└─ types/next-auth.d.ts         # session.user.isApprover augmentation
```

**Reads vs. writes:** pages are `async` Server Components that call
`lib/orders.ts` directly (no REST layer for GETs). Mutations are Server
Actions (`lib/actions/*.ts`) invoked from forms with `useActionState`. Route
Handlers exist only for the NextAuth callback and the two file-download
redirects. See `CLAUDE.md` for the full set of conventions.

**Authorization:** `allowed_approvers` is the single source of truth for who
can approve/reject — not a role on the user. `src/proxy.ts` keeps signed-out
users off `/orders/*` and `/approvals/*`, and non-approvers off
`/approvals/*`; pages re-check with `requireUser()`/`requireApprover()` as
defense in depth.

**File access:** uploaded quotes and approval receipts are stored in S3 with
`ServerSideEncryption` and are never public — `/api/orders/[id]/quote` and
`/api/orders/[id]/receipt` check the requester owns the order (or the
viewer is an approver) and then redirect to a URL that expires in 5 minutes.

**Quote file upload:** the "New Order" form doesn't route the file through a
Server Action's request body — `requestQuoteUploadUrl` (called directly from
`OrderForm`, not via `<form action>`) mints a presigned S3 PUT URL as soon as
a file is picked, the browser uploads straight to S3, and only the resulting
key/filename travel through `createOrder` as hidden form fields. This is
what lets the app accept files up to its own 15MB limit on serverless hosts
like Vercel, which cap function request bodies at 4.5MB — see the S3 CORS
prerequisite above.

**Approval receipt** (`lib/receipt-pdf.ts`): the receipt is the requester's
*own* quote file (`quoteFileKey`/`quoteFileName` on the order), not a
freshly generated document. On approval, `approveOrder` downloads that file
from S3 and `stampApprovalOnQuoteFile`:

1. Converts it to PDF if it isn't one already — a PNG/JPEG is wrapped in a
   single-page PDF sized to fit the image; a Word/Excel file is converted
   via `office-convert.ts` (`libreoffice-convert`, which shells out to a
   local LibreOffice install — see prerequisite below). A PDF quote file
   passes through untouched.
2. Embeds `public/sign.png` (an "APPROVED" stamp icon), rotated into the
   bottom-right corner of the last page so it reads like a physical rubber
   stamp, with the sign-off date printed just below it.

This is a visual marker of the decision recorded in the database — not a
cryptographic signature.

> **Prerequisite:** approving an order whose quote file is Word/Excel
> requires LibreOffice installed on the machine running the app (the
> `soffice` binary reachable on `PATH`, or via LibreOffice's default
> install location). Not needed for PDF/PNG/JPEG quote files. See
> [libreoffice-convert's README](https://www.npmjs.com/package/libreoffice-convert)
> for per-OS install notes.

### Database schema

- `users` — directory of everyone who's signed in (upserted on every login); not used for authorization.
- `allowed_approvers` — authorization list; membership = can approve/reject.
- `purchase_orders` — the order itself: requester, vendor, amount, quote file key, status, decision fields, approval receipt key.
- `order_events` — append-only audit trail (`SUBMITTED` / `APPROVED` / `REJECTED`).

## Known dev-dependency advisory

`drizzle-kit` pulls in an old `esbuild` transitively (via `@esbuild-kit/*`),
which `npm audit` flags as moderate (dev-server CORS issue). It only affects
`drizzle-kit studio`'s local dev server and is not part of the production
bundle; fixing it would require downgrading `drizzle-kit` to a much older
version. Left as-is deliberately — do not `npm audit fix --force` this one.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the dev server (Turbopack) |
| `npm run build` / `npm start` | Production build / start |
| `npm run lint` / `npm run typecheck` | ESLint / `tsc --noEmit` |
| `npm run db:generate` | Generate a Drizzle migration from `src/db/schema.ts` |
| `npm run db:migrate` | Apply migrations to `DATABASE_URL` |
| `npm run db:push` | Push schema directly (skips migration files — dev convenience) |
| `npm run db:studio` | Open Drizzle Studio against `DATABASE_URL` |
| `npm run db:seed` | Insert `SEED_APPROVER_EMAILS` into `allowed_approvers` |
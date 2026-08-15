import { eq } from "drizzle-orm";
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

import { allowedApprovers, users } from "@/db/schema";
import { db } from "@/lib/db";
import { env } from "@/lib/env";

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: env.NEXTAUTH_SECRET,
  providers: [
    Google({
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  // JWT sessions: no `accounts`/`sessions` tables to manage. `users` and
  // `allowed_approvers` (see src/db/schema.ts) are the only auth-related
  // tables this app owns.
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  callbacks: {
    async signIn({ user }) {
      if (!user.email) return false;

      const email = user.email.toLowerCase();
      // Write-through directory: every successful Google sign-in upserts
      // the user row, so `users` always reflects "everyone who has signed
      // in" without a separate admin step.
      await db
        .insert(users)
        .values({ email, name: user.name, image: user.image })
        .onConflictDoUpdate({
          target: users.email,
          set: { name: user.name, image: user.image, updatedAt: new Date() },
        });
      return true;
    },
    async jwt({ token }) {
      if (token.email) {
        token.isApprover = await isAuthorizedApprover(token.email);
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.email = (token.email ?? session.user.email ?? "").toLowerCase();
        session.user.isApprover = Boolean(token.isApprover);
      }
      return session;
    },
  },
});

/** Checks the `allowed_approvers` table — the single source of truth for who may approve/reject orders. */
export async function isAuthorizedApprover(email: string): Promise<boolean> {
  const [row] = await db
    .select({ id: allowedApprovers.id })
    .from(allowedApprovers)
    .where(eq(allowedApprovers.email, email.toLowerCase()))
    .limit(1);
  return Boolean(row);
}

/** Resolves the current session, or `null` if signed out. Safe to call from server components, route handlers, and server actions. */
export async function getSession() {
  return auth();
}

/** Requires a signed-in user; throws otherwise. Use in server actions/route handlers, where a page-level redirect isn't appropriate. */
export async function requireUser() {
  const session = await auth();
  if (!session?.user?.email) {
    throw new Error("You must be signed in to do that.");
  }
  return session.user as typeof session.user & { email: string };
}

/** Requires a signed-in, authorized approver; throws otherwise. */
export async function requireApprover() {
  const user = await requireUser();
  if (!user.isApprover) {
    throw new Error("You are not authorized to approve or reject orders.");
  }
  return user;
}
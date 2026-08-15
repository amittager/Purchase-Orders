import { DefaultSession } from "next-auth";

// Augments the built-in session/JWT types with the fields this app adds in
// src/lib/auth.ts's `jwt`/`session` callbacks.
declare module "next-auth" {
  interface Session {
    user: {
      isApprover: boolean;
    } & DefaultSession["user"];
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    isApprover?: boolean;
  }
}
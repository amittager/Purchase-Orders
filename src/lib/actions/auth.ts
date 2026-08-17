"use server";

import { signIn, signOut } from "@/lib/auth";

export async function signInWithGoogle(callbackUrl?: string) {
  // "/" is the role-aware landing page (see app/page.tsx) — approvers get
  // sent on to /approvals from there, everyone else to /orders.
  await signIn("google", { redirectTo: callbackUrl || "/" });
}

export async function signOutAction() {
  await signOut({ redirectTo: "/" });
}
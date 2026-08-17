import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { signInWithGoogle } from "@/lib/actions/auth";
import { auth } from "@/lib/auth";

export default async function LoginPage({
  searchParams,
}: PageProps<"/login">) {
  const { callbackUrl } = await searchParams;
  const requestedTarget = typeof callbackUrl === "string" ? callbackUrl : undefined;

  const session = await auth();
  if (session?.user) {
    // Honor an explicit callbackUrl (e.g. proxy.ts sent them here trying to
    // reach a specific page); otherwise default by role — approvers to
    // their queue, everyone else to their own orders.
    redirect(requestedTarget ?? (session.user.isApprover ? "/approvals" : "/orders"));
  }

  // Not signed in yet, so role isn't known until after the OAuth
  // round-trip — fall back to "/", which does the role-based redirect
  // once there's a session to check.
  const boundSignIn = signInWithGoogle.bind(null, requestedTarget ?? "/");

  return (
    <div className="mx-auto flex max-w-sm flex-col items-center py-16">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>
            Use your organization&apos;s Google account to access Procurement
            Order Management.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={boundSignIn}>
            <Button type="submit" className="w-full">
              Sign in with Google
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
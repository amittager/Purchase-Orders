import { CheckCircle2, FileSignature, ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { signInWithGoogle } from "@/lib/actions/auth";
import { auth } from "@/lib/auth";

export default async function HomePage() {
  const session = await auth();
  if (session?.user) {
    // Approvers land on their queue, not their own order history — that's
    // what they're here to act on.
    redirect(session.user.isApprover ? "/approvals" : "/orders");
  }

  // Not signed in yet, so approver status isn't known until after the OAuth
  // round-trip completes — send them back here (default, no callbackUrl)
  // and let the branch above do the role-based redirect once there's a
  // session to check.
  const boundSignIn = signInWithGoogle.bind(null, "/");

  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center gap-8 py-12 text-center">
      <div className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Procurement Order Management
        </h1>
        <p className="text-balance text-muted-foreground">
          Submit purchase requests with a price quote, route them to
          authorized managers, and get back a stamped PDF approval receipt
          — all tracked in one place.
        </p>
      </div>

      <form action={boundSignIn}>
        <Button type="submit" size="lg">
          Sign in with Google to get started
        </Button>
      </form>

      <div className="grid w-full gap-4 pt-8 text-left sm:grid-cols-3">
        <Card>
          <CardContent className="flex flex-col gap-2 pt-4">
            <CheckCircle2 className="size-5 text-primary" />
            <p className="text-sm font-medium">Submit requests</p>
            <p className="text-xs text-muted-foreground">
              Attach a price quote and route it for approval in seconds.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col gap-2 pt-4">
            <ShieldCheck className="size-5 text-primary" />
            <p className="text-sm font-medium">Manager review</p>
            <p className="text-xs text-muted-foreground">
              Authorized approvers can review and decide on any order.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col gap-2 pt-4">
            <FileSignature className="size-5 text-primary" />
            <p className="text-sm font-medium">Signed proof</p>
            <p className="text-xs text-muted-foreground">
              Approvals generate a digitally signed PDF receipt in S3.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
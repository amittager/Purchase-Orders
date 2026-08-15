import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { signInWithGoogle } from "@/lib/actions/auth";
import { auth } from "@/lib/auth";

export default async function LoginPage({
  searchParams,
}: PageProps<"/login">) {
  const { callbackUrl } = await searchParams;
  const target = typeof callbackUrl === "string" ? callbackUrl : "/orders";

  const session = await auth();
  if (session?.user) {
    redirect(target);
  }

  const boundSignIn = signInWithGoogle.bind(null, target);

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
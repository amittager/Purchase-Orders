import { LogOut } from "lucide-react";
import Link from "next/link";

import { NavLinks } from "@/components/nav/nav-links";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { signInWithGoogle, signOutAction } from "@/lib/actions/auth";
import { auth } from "@/lib/auth";

export async function Header() {
  const session = await auth();
  const user = session?.user;
  const boundSignIn = signInWithGoogle.bind(null, undefined);

  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4">
        <div className="flex items-center gap-6">
          <Link href="/" className="shrink-0 font-semibold tracking-tight">
            Procurement<span className="text-primary">OMS</span>
          </Link>
          {user && <NavLinks isApprover={Boolean(user.isApprover)} />}
        </div>

        {user ? (
          <div className="flex items-center gap-3">
            <div className="hidden text-right text-sm leading-tight sm:block">
              <p className="font-medium">{user.name}</p>
              <p className="text-muted-foreground">{user.email}</p>
            </div>
            <Avatar className="size-8">
              <AvatarImage src={user.image ?? undefined} alt={user.name ?? "User avatar"} />
              <AvatarFallback>
                {(user.name ?? user.email ?? "?").slice(0, 1).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <form action={signOutAction}>
              <Button type="submit" variant="ghost" size="icon" aria-label="Sign out">
                <LogOut className="size-4" />
              </Button>
            </form>
          </div>
        ) : (
          <form action={boundSignIn}>
            <Button type="submit" size="sm">
              Sign in with Google
            </Button>
          </form>
        )}
      </div>
    </header>
  );
}
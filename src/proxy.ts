import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";

// Next.js 16 renamed the `middleware` file convention to `proxy`; the
// `proxy` runtime is always Node.js (no edge), which is exactly what
// NextAuth's JWT decoding needs here — nothing further to configure.
export default auth((req) => {
  const { pathname } = req.nextUrl;
  const session = req.auth;

  const isApprovalsRoute = pathname.startsWith("/approvals");
  const isProtectedRoute = pathname.startsWith("/orders") || isApprovalsRoute;

  if (!isProtectedRoute) return NextResponse.next();

  if (!session?.user) {
    const loginUrl = new URL("/login", req.nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isApprovalsRoute && !session.user.isApprover) {
    return NextResponse.redirect(new URL("/orders", req.nextUrl.origin));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/orders/:path*", "/approvals/:path*"],
};
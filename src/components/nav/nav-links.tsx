"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

export function NavLinks({ isApprover }: { isApprover: boolean }) {
  const pathname = usePathname();

  // Approvers see "All Pending Approvals" first — that's the thing they're
  // actually here to act on; "My Orders"/"New Order" are secondary for them.
  const links = isApprover
    ? [
        { href: "/approvals", label: "All Pending Approvals" },
        { href: "/orders", label: "My Orders" },
        { href: "/orders/new", label: "New Order" },
      ]
    : [
        { href: "/orders", label: "My Orders" },
        { href: "/orders/new", label: "New Order" },
      ];

  return (
    <nav className="flex items-center gap-1">
      {links.map((link) => {
        const active =
          link.href === "/orders"
            ? pathname === "/orders"
            : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              active
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
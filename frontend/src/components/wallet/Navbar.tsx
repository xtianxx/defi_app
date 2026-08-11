"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { ConnectButton } from "@/components/wallet/ConnectButton";
import { cn } from "@/lib/utils";

interface NavLink {
  href: string;
  label: string;
  muted?: boolean;
}

const NAV_LINKS: NavLink[] = [
  { href: "/swap", label: "Swap" },
  { href: "/liquidity", label: "Liquidity" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/faucet", label: "Faucet" },
  { href: "/debug", label: "Debug", muted: true },
];

/**
 * Top navigation. Always-visible wallet connection lives on the right.
 * Below the md breakpoint the link row collapses behind a hamburger toggle.
 */
export function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <header className="border-b">
      <div className="container flex h-auto min-h-14 flex-wrap items-center justify-between gap-y-2 py-2 md:h-14 md:flex-nowrap md:py-0">
        {/* Desktop link row */}
        <nav className="hidden flex-wrap items-center gap-x-3 gap-y-1 text-sm font-medium md:flex md:gap-x-6">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn("hover:opacity-80", link.muted && "text-muted-foreground")}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Wallet + mobile toggle */}
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-2 md:order-last">
          <ConnectButton />
          <button
            type="button"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-border p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:hidden"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {/* Mobile link panel */}
        {open && (
          <nav className="w-full md:hidden">
            <div className="flex flex-col gap-1 pb-2">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "rounded-md px-3 py-2.5 text-sm font-medium hover:bg-accent hover:opacity-80",
                    link.muted && "text-muted-foreground",
                  )}
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </nav>
        )}
      </div>
    </header>
  );
}

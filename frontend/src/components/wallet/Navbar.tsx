import Link from "next/link";
import { ConnectButton } from "@/components/wallet/ConnectButton";

/**
 * Top navigation. Always-visible wallet connection lives on the right.
 * Phase 2 (T027) wires the network-switch banner into ConnectButton.
 */
export function Navbar() {
  return (
    <header className="border-b">
      <div className="container flex h-14 items-center justify-between">
        <nav className="flex items-center gap-6 text-sm font-medium">
          <Link href="/swap" className="hover:opacity-80">
            Swap
          </Link>
          <Link href="/liquidity" className="hover:opacity-80">
            Liquidity
          </Link>
          <Link href="/portfolio" className="hover:opacity-80">
            Portfolio
          </Link>
          <Link href="/faucet" className="hover:opacity-80">
            Faucet
          </Link>
          <Link href="/debug" className="hover:opacity-80 text-muted-foreground">
            Debug
          </Link>
        </nav>
        <ConnectButton />
      </div>
    </header>
  );
}

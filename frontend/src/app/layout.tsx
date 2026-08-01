/* Next.js App Router layouts must co-export `metadata` / `viewport` alongside
 * the default root component — that mix trips the react-refresh dev warning
 * by design. The rule is informational; it does not affect production builds. */
import type { Metadata, Viewport } from "next";
import { Web3Provider } from "@/providers/Web3Provider";
import { Navbar } from "@/components/wallet/Navbar";
import "@/styles/globals.css";

// eslint-disable-next-line react-refresh/only-export-components
export const metadata: Metadata = {
  title: "Uniswap V2 Resume",
  description:
    "Uniswap V2-style decentralized exchange — swap, add/remove liquidity, and view portfolio on local anvil and Sepolia testnet.",
};

// eslint-disable-next-line react-refresh/only-export-components
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <Web3Provider>
          <div className="flex min-h-screen flex-col">
            <Navbar />
            <main className="flex-1">{children}</main>
          </div>
        </Web3Provider>
      </body>
    </html>
  );
}

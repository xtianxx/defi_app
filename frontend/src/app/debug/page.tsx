"use client";

import { useWeb3Context } from "@/providers/Web3Context";
import { usePair } from "@/hooks/usePair";
import { useToken } from "@/hooks/useToken";
import { getTokenAddress } from "@/lib/contracts/tokens";
import { getDeployment } from "@/lib/contracts/addresses";
import { formatTokenAmount, truncateAddress } from "@/lib/format";
import { ANVIL_CHAIN_ID } from "@/lib/chains";

/**
 * Debug page — verifies the Phase 2 foundation (Web3Provider → usePair → onchain)
 * against a live anvil node. Not part of the spec; remove before portfolio demo
 * or gate it behind a dev-only check. See plan.md Phase 2 checkpoint.
 */
export default function DebugPage() {
  const { status, account, chainId, chain, error } = useWeb3Context();

  const effectiveChainId = chainId ?? ANVIL_CHAIN_ID;
  const weth = getTokenAddress("WETH", effectiveChainId);
  const usdc = getTokenAddress("USDC", effectiveChainId);
  const deployment = getDeployment(effectiveChainId);
  const ZERO = "0x0000000000000000000000000000000000000000" as const;
  const factoryOk = deployment !== null && deployment.factory !== ZERO;
  const wethOk = deployment !== null && deployment.weth !== ZERO;
  const routerOk = deployment !== null && deployment.router !== ZERO;

  const pair = usePair(weth, usdc);
  const wethToken = useToken(weth);
  const usdcToken = useToken(usdc);

  return (
    <div className="container py-10 font-mono text-sm space-y-6">
      <div>
        <h1 className="text-xl font-bold">Debug — Phase 2 Foundation Check</h1>
        <p className="text-muted-foreground mt-1">
          Verifies Web3Provider → usePair → onchain against a live node. Swap/Liquidity UI lands in Phase 3.
        </p>
      </div>

      {/* Wallet */}
      <section className="space-y-1">
        <h2 className="font-semibold border-b pb-1">Wallet</h2>
        <p>Status: <span className={status === "ready" ? "text-green-600" : status === "error" ? "text-red-600" : ""}>{status}</span></p>
        <p>Account: {account ? truncateAddress(account) : "—"}</p>
        <p>Chain: {chain?.name ?? "—"} ({chainId})</p>
        {error && <p className="text-red-600">Error: {error.code} — {error.message}</p>}
      </section>

      {/* Deployment config */}
      <section className="space-y-1">
        <h2 className="font-semibold border-b pb-1">Deployment (chain {effectiveChainId})</h2>
        <p>Factory: {factoryOk ? <span className="text-green-600">✓ deployed</span> : "not deployed"} {deployment?.factory && deployment.factory !== ZERO ? `(${truncateAddress(deployment.factory)})` : ""}</p>
        <p>Router: {routerOk ? <span className="text-green-600">✓ deployed</span> : <span className="text-muted-foreground">pending Phase 3</span>}</p>
        <p>WETH: {wethOk ? <span className="text-green-600">✓ deployed</span> : "not deployed"} {deployment?.weth && deployment.weth !== ZERO ? `(${truncateAddress(deployment.weth)})` : ""}</p>
        {!factoryOk && <p className="text-red-600 text-xs">Run contracts/dev-setup.sh to deploy + sync</p>}
      </section>

      {/* Tokens */}
      <section className="space-y-1">
        <h2 className="font-semibold border-b pb-1">Tokens</h2>
        <p>WETH address: {weth ?? "not set"}</p>
        <p>WETH balance: {wethToken.balance !== null ? formatTokenAmount(wethToken.balance, 18) : "—"}</p>
        <p>USDC address: {usdc ?? "not set"}</p>
        <p>USDC balance: {usdcToken.balance !== null ? formatTokenAmount(usdcToken.balance, 6) : "—"}</p>
      </section>

      {/* Pair */}
      <section className="space-y-1">
        <h2 className="font-semibold border-b pb-1">WETH/USDC Pair</h2>
        <p>Pair address: {pair.pairAddress ?? "not deployed"}</p>
        {pair.pairAddress && (
          <>
            <p>token0: {pair.token0}</p>
            <p>token1: {pair.token1}</p>
            {pair.reserves && (
              <>
                <p>reserve0: {pair.reserves.reserve0.toString()}</p>
                <p>reserve1: {pair.reserves.reserve1.toString()}</p>
                <p>blockTimestampLast: {pair.reserves.blockTimestampLast}</p>
              </>
            )}
            <p>LP totalSupply: {pair.liquidity?.toString() ?? "—"}</p>
            <p>My LP balance: {pair.lpBalance?.toString() ?? "—"}</p>
            <p>price0CumulativeLast: {pair.price0CumulativeLast?.toString() ?? "—"}</p>
            <p>price1CumulativeLast: {pair.price1CumulativeLast?.toString() ?? "—"}</p>
          </>
        )}
      </section>

      <button
        type="button"
        onClick={() => void pair.refresh()}
        className="px-3 py-1 border rounded text-xs hover:bg-accent"
      >
        Refresh pair
      </button>
    </div>
  );
}
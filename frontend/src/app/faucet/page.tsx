"use client";

import { useMemo } from "react";
import { useWeb3Context } from "@/providers/Web3Context";
import { getDeployment } from "@/lib/contracts/addresses";
import { FaucetWidget } from "@/components/faucet/FaucetWidget";

export default function FaucetPage() {
  const { chainId } = useWeb3Context();
  const deployment = useMemo(
    () => (chainId !== null ? getDeployment(chainId) : null),
    [chainId],
  );

  return (
    <div className="container mx-auto flex max-w-md flex-col items-center px-4 py-10">
      <h1 className="text-3xl font-bold tracking-tight">Faucet</h1>
      <p className="mt-2 text-center text-sm text-muted-foreground">
        Request demo tokens once every 24 hours.
      </p>
      <div className="mt-6 w-full">
        <FaucetWidget deployment={deployment} />
      </div>
    </div>
  );
}

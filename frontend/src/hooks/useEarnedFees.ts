"use client";

import { useEffect, useState } from "react";
import { Contract } from "ethers";
import { IUniswapV2Pair_ABI } from "@/lib/contracts/abis";
import { estimateFeesEarned, fetchMintBurnTotals } from "@/lib/fees";
import { useWeb3Context } from "@/providers/Web3Context";

export interface UseEarnedFeesResult {
  /** Token0 units, in PAIR token0/token1 order (NOT display symbolA order). */
  feesEarned0: bigint | null;
  feesEarned1: bigint | null;
}

/**
 * Estimated fees the connected user has earned in one pair (T062).
 *
 * claimable share of reserves + burned - minted (data-model.md E6). Returns
 * null until the event scan resolves, and stays null when there is no wallet /
 * pair / position so callers can render a placeholder. No RPC work is done
 * when the user holds no LP in the pair (lpBalance <= 0n).
 */
export function useEarnedFees(params: {
  pairAddress: `0x${string}` | null;
  lpBalance: bigint | null;
  reserve0: bigint | null;
  reserve1: bigint | null;
  totalSupply: bigint | null;
}): UseEarnedFeesResult {
  const { account, provider } = useWeb3Context();
  const { pairAddress, lpBalance, reserve0, reserve1, totalSupply } = params;
  const [fees, setFees] = useState<UseEarnedFeesResult>({ feesEarned0: null, feesEarned1: null });

  useEffect(() => {
    if (
      !account ||
      !provider ||
      !pairAddress ||
      lpBalance === null ||
      lpBalance <= 0n ||
      reserve0 === null ||
      reserve1 === null ||
      totalSupply === null ||
      totalSupply <= 0n
    ) {
      setFees({ feesEarned0: null, feesEarned1: null });
      return;
    }

    let cancelled = false;
    const pair = new Contract(pairAddress, IUniswapV2Pair_ABI, provider);
    fetchMintBurnTotals(pair, account)
      .then((totals) => {
        if (cancelled) return;
        setFees(estimateFeesEarned({ lpBalance, reserve0, reserve1, totalSupply, totals }));
      })
      .catch(() => {
        if (!cancelled) setFees({ feesEarned0: null, feesEarned1: null });
      });
    return () => {
      cancelled = true;
    };
  }, [account, provider, pairAddress, lpBalance, reserve0, reserve1, totalSupply]);

  return fees;
}

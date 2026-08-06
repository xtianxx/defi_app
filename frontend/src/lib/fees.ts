import { type Contract, type EventLog } from "ethers";

/** Decoded Mint event args (IUniswapV2Pair). `sender` is the Router for routed adds. */
interface MintEventArgs {
  sender: string;
  amount0: bigint;
  amount1: bigint;
}

/** Decoded Burn event args (IUniswapV2Pair). */
interface BurnEventArgs {
  sender: string;
  amount0: bigint;
  amount1: bigint;
  to: string;
}

/** Summed user liquidity-add/remove amounts for one pair (token0/token1 units). */
export interface MintBurnTotals {
  minted0: bigint;
  minted1: bigint;
  burned0: bigint;
  burned1: bigint;
}

/**
 * Sum the user's Mint / Burn amounts for one pair.
 *
 * - Mint: only `sender` is indexed and it is the Router — attribute via the
 *   transaction `from` (the EOA that called the router), mirroring usePortfolio.
 * - Burn: `to` (the LP recipient) is indexed — filter directly.
 *
 * Pruned transactions are skipped (treated as not minted) rather than failing
 * the whole fetch.
 */
export async function fetchMintBurnTotals(
  pair: Contract,
  account: `0x${string}`,
): Promise<MintBurnTotals> {
  const [mintLogs, burnLogs] = await Promise.all([
    pair.queryFilter(pair.filters.Mint(), 0, "latest") as Promise<EventLog[]>,
    pair.queryFilter(pair.filters.Burn(null, null, null, account), 0, "latest") as Promise<EventLog[]>,
  ]);

  const totals: MintBurnTotals = { minted0: 0n, minted1: 0n, burned0: 0n, burned1: 0n };

  for (const ev of mintLogs) {
    try {
      const tx = await ev.getTransaction();
      if (tx.from.toLowerCase() !== account.toLowerCase()) continue;
    } catch {
      continue; // tx pruned — skip rather than fail
    }
    const args = ev.args as unknown as MintEventArgs;
    totals.minted0 += args.amount0;
    totals.minted1 += args.amount1;
  }

  for (const ev of burnLogs) {
    const args = ev.args as unknown as BurnEventArgs;
    totals.burned0 += args.amount0;
    totals.burned1 += args.amount1;
  }

  return totals;
}

/**
 * Estimated fees earned by a user in one pair (data-model.md E6 / T062).
 *
 * claimable = reserve * lpBalance / totalSupply — the user's current share of
 * the pool reserves, which grows as swap fees accrue inside the reserves.
 * feesEarned = claimable + burned - minted. Negative estimates (e.g. LP tokens
 * transferred away) are clamped to 0. An estimate, not an on-chain exact value
 * (exact requires per-user snapshotting).
 */
export function estimateFeesEarned(params: {
  lpBalance: bigint;
  reserve0: bigint;
  reserve1: bigint;
  totalSupply: bigint;
  totals: MintBurnTotals;
}): { feesEarned0: bigint; feesEarned1: bigint } {
  const { lpBalance, reserve0, reserve1, totalSupply, totals } = params;
  if (totalSupply <= 0n) return { feesEarned0: 0n, feesEarned1: 0n };

  const claimable0 = (reserve0 * lpBalance) / totalSupply;
  const claimable1 = (reserve1 * lpBalance) / totalSupply;

  const fee0 = claimable0 + totals.burned0 - totals.minted0;
  const fee1 = claimable1 + totals.burned1 - totals.minted1;

  return { feesEarned0: fee0 < 0n ? 0n : fee0, feesEarned1: fee1 < 0n ? 0n : fee1 };
}

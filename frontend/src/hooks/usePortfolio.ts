"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Contract, ZeroAddress, type EventLog } from "ethers";
import { IUniswapV2Factory_ABI, IUniswapV2Pair_ABI } from "@/lib/contracts/abis";
import { getDeployment } from "@/lib/contracts/addresses";
import { getTokenAddress, isValidAddress, KNOWN_PAIRS } from "@/lib/contracts/tokens";
import { useWeb3Context } from "@/providers/Web3Context";

export interface HistoryEntry {
  type: "swap" | "mint" | "burn";
  pairAddress: `0x${string}`;
  pairLabel: string; // e.g. "WETH/USDC"
  token0Symbol: string;
  token1Symbol: string;
  amount0: bigint;
  amount1: bigint;
  timestamp: number; // unix seconds (from block timestamp)
  txHash: `0x${string}`;
  direction?: "in" | "out"; // for swaps only
}

export interface UsePortfolioResult {
  history: HistoryEntry[];
  isLoading: boolean;
  error: string | null;
  page: number;
  pageSize: number;
  setPage: (n: number) => void;
  totalCount: number;
  refresh: () => Promise<void>;
}

type PairSymbol = "WETH" | "USDC" | "DAI" | "WBTC";

/** Decoded Swap event args (IUniswapV2Pair). */
interface SwapEventArgs {
  sender: string;
  amount0In: bigint;
  amount1In: bigint;
  amount0Out: bigint;
  amount1Out: bigint;
  to: string;
}

/** Decoded Mint event args (IUniswapV2Pair). */
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

const PAGE_SIZE = 10;

/**
 * eth_getLogs block-range guard. Sepolia RPC providers (Alchemy/Infura) reject
 * a single log query spanning more than ~10,000 blocks with
 * "range <n> exceeds limit of 10000". We must never issue a Swap/Mint/Burn
 * query from block 0 to latest on a high-block network. Queries are instead
 * anchored at each pair's creation block (see getPairCreationBlock) with a
 * bounded recent-window fallback.
 */
const LOG_QUERY_WINDOW_BLOCKS = 9000; // comfortably under the 10k RPC limit; wide enough to reach the Sepolia demo pair creation block (~6000 blocks ago)

/**
 * Query Swap/Mint/Burn logs for one pair and reduce them to HistoryEntry[].
 *
 * - Swap: indexed `to` filter → the user is the recipient of a swap they
 *   initiated (or received through). amounts are signed from the pool's
 *   perspective per token: positive = token flowed INTO the pool (user sold),
 *   negative = token flowed OUT of the pool to the user (user bought).
 *   `direction` is from the user's perspective: "in" = user received tokens.
 * - Burn: indexed `to` filter → the user removed liquidity. Amounts positive;
 *   the `type` field distinguishes removal from addition.
 * - Mint: only `sender` (the router) is indexed, so we cannot filter by user
 *   via the event alone — query all and attribute by transaction `from`
 *   (the EOA that called the router).
 *
 * Spec: tasks.md T064, data-model.md §"Liquidity events" (US4).
 */
/**
 * Resolve the block at which `pairAddress` was created by scanning the
 * factory's PairCreated logs. Bounded to the most recent LOG_QUERY_WINDOW_BLOCKS
 * so the eth_getLogs range stays under the RPC limit on high-block networks
 * like Sepolia. For a freshly-deployed DEX the pair is created inside the
 * window; returns null when not found so callers can fall back to the window
 * itself.
 */
async function getPairCreationBlock(
  factory: Contract,
  pairAddress: `0x${string}`,
  latestBlock: number,
): Promise<number | null> {
  const fromBlock = Math.max(0, latestBlock - LOG_QUERY_WINDOW_BLOCKS);
  // `pair` is NOT indexed on PairCreated (only token0/token1 are), so ethers v6
  // rejects passing it as a filter arg ("cannot filter non-indexed parameters").
  // Query all creation events in the window and match the pair address
  // client-side instead.
  const logs = (await factory.queryFilter(
    factory.filters.PairCreated(),
    fromBlock,
    latestBlock,
  )) as EventLog[];
  const target = pairAddress.toLowerCase();
  // Newest first — return the latest creation block for this pair.
  for (let i = logs.length - 1; i >= 0; i--) {
    const pair = logs[i].args?.pair as `0x${string}` | undefined;
    if (pair && pair.toLowerCase() === target) return logs[i].blockNumber;
  }
  return null;
}

async function fetchPairHistory(
  pair: Contract,
  pairAddress: `0x${string}`,
  symbolA: PairSymbol,
  symbolB: PairSymbol,
  tokenA: `0x${string}`,
  tokenB: `0x${string}`,
  account: `0x${string}`,
  fromBlock: number,
): Promise<HistoryEntry[]> {
  // ethers v6: filters.<Event>(...) positional args map to ALL parameters in
  // ABI declaration order (not just indexed ones); non-indexed slots MUST be
  // null. Swap(address indexed sender, uint amount0In, uint amount1In,
  // uint amount0Out, uint amount1Out, address indexed to) → 6 slots, filter
  // on `to` (recipient). Burn(address indexed sender, uint amount0, uint
  // amount1, address indexed to) → 4 slots, filter on `to`.
  const [swapLogs, burnLogs, mintLogs] = await Promise.all([
    pair.queryFilter(pair.filters.Swap(null, null, null, null, null, account), fromBlock, "latest") as Promise<EventLog[]>,
    pair.queryFilter(pair.filters.Burn(null, null, null, account), fromBlock, "latest") as Promise<EventLog[]>,
    pair.queryFilter(pair.filters.Mint(), fromBlock, "latest") as Promise<EventLog[]>,
  ]);

  // The pair orders token0 < token1 (CREATE2 sorting); resolve the symbols by
  // matching the on-chain token addresses against the KNOWN_PAIRS addresses.
  const [t0, t1] = await Promise.all([pair.token0(), pair.token1()]);
  const token0Symbol: string = (t0 as `0x${string}`).toLowerCase() === tokenA.toLowerCase() ? symbolA : symbolB;
  const token1Symbol: string = (t1 as `0x${string}`).toLowerCase() === tokenB.toLowerCase() ? symbolB : symbolA;
  const pairLabel = `${token0Symbol}/${token1Symbol}`;

  const swapEntries = await Promise.all(
    swapLogs.map(async (ev): Promise<HistoryEntry> => {
      const args = ev.args as unknown as SwapEventArgs;
      const block = await ev.getBlock();
      return {
        type: "swap",
        pairAddress,
        pairLabel,
        token0Symbol,
        token1Symbol,
        amount0: args.amount0In > 0n ? args.amount0In : -args.amount0Out,
        amount1: args.amount1In > 0n ? args.amount1In : -args.amount1Out,
        timestamp: block.timestamp,
        txHash: ev.transactionHash as `0x${string}`,
        direction: args.amount0Out > 0n || args.amount1Out > 0n ? "in" : "out",
      };
    }),
  );

  const burnEntries = await Promise.all(
    burnLogs.map(async (ev): Promise<HistoryEntry> => {
      const args = ev.args as unknown as BurnEventArgs;
      const block = await ev.getBlock();
      return {
        type: "burn",
        pairAddress,
        pairLabel,
        token0Symbol,
        token1Symbol,
        amount0: args.amount0,
        amount1: args.amount1,
        timestamp: block.timestamp,
        txHash: ev.transactionHash as `0x${string}`,
      };
    }),
  );

  const mintResults = await Promise.all(
    mintLogs.map(async (ev): Promise<HistoryEntry | null> => {
      try {
        const tx = await ev.getTransaction();
        if (tx.from.toLowerCase() !== account.toLowerCase()) return null;
      } catch {
        // Transaction no longer available (e.g. pruned) — skip rather than
        // fail the whole portfolio fetch.
        return null;
      }
      const args = ev.args as unknown as MintEventArgs;
      const block = await ev.getBlock();
      return {
        type: "mint",
        pairAddress,
        pairLabel,
        token0Symbol,
        token1Symbol,
        amount0: args.amount0,
        amount1: args.amount1,
        timestamp: block.timestamp,
        txHash: ev.transactionHash as `0x${string}`,
      };
    }),
  );
  const mintEntries = mintResults.filter((e): e is HistoryEntry => e !== null);

  return [...swapEntries, ...burnEntries, ...mintEntries];
}

/**
 * Aggregate Swap/Mint/Burn history across all KNOWN_PAIRS for the connected
 * user, sorted newest-first, with client-side pagination (10 per page).
 *
 * Spec: tasks.md T064 (US4) — portfolio "transaction history" (SC-003).
 */
export function usePortfolio(): UsePortfolioResult {
  const { account, chainId, provider } = useWeb3Context();
  const [allHistory, setAllHistory] = useState<HistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const refresh = useCallback(async () => {
    // No wallet / unsupported chain / missing deployment → empty history.
    if (!account || !provider || chainId === null) {
      setAllHistory([]);
      setError(null);
      setIsLoading(false);
      setPage(1);
      return;
    }
    const deployment = getDeployment(chainId);
    if (!deployment || !isValidAddress(deployment.factory)) {
      setAllHistory([]);
      setError(null);
      setIsLoading(false);
      setPage(1);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const factory = new Contract(deployment.factory, IUniswapV2Factory_ABI, provider);
      const latestBlock = await provider.getBlockNumber();
      const entries: HistoryEntry[] = [];
      for (const [symbolA, symbolB] of KNOWN_PAIRS) {
        const tokenA = getTokenAddress(symbolA, chainId);
        const tokenB = getTokenAddress(symbolB, chainId);
        if (!tokenA || !tokenB) continue; // token not deployed on this chain
        const pairAddress = (await factory.getPair(tokenA, tokenB)) as `0x${string}`;
        if (pairAddress === ZeroAddress) continue; // no pool for this pair
        const pair = new Contract(pairAddress, IUniswapV2Pair_ABI, provider);
        // Anchor the log query at the pair's creation block when we can find
        // it; otherwise fall back to a bounded recent window. This keeps every
        // eth_getLogs range under the RPC limit on high-block networks.
        const creationBlock = await getPairCreationBlock(factory, pairAddress, latestBlock);
        const fromBlock = creationBlock ?? Math.max(0, latestBlock - LOG_QUERY_WINDOW_BLOCKS);
        entries.push(...(await fetchPairHistory(pair, pairAddress, symbolA, symbolB, tokenA, tokenB, account, fromBlock)));
      }
      // Newest first (SC-003: history ordering by blockTimestamp).
      entries.sort((a, b) => b.timestamp - a.timestamp);
      setAllHistory(entries);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load portfolio history");
    } finally {
      setIsLoading(false);
    }
  }, [account, chainId, provider]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const totalCount = allHistory.length;
  // Clamp so a shrunken history can never leave `page` out of range.
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);

  const history = useMemo(
    () => allHistory.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [allHistory, currentPage],
  );

  return useMemo(
    () => ({
      history,
      isLoading,
      error,
      page: currentPage,
      pageSize: PAGE_SIZE,
      setPage,
      totalCount,
      refresh,
    }),
    [history, isLoading, error, currentPage, totalCount, refresh],
  );
}

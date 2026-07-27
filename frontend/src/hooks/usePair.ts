"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Contract, getAddress, keccak256, solidityPacked, ZeroAddress } from "ethers";
import { IUniswapV2Factory_ABI, IUniswapV2Pair_ABI } from "@/lib/contracts/abis";
import { getDeployment } from "@/lib/contracts/addresses";
import { useWeb3Context } from "@/providers/Web3Provider";
import { isValidAddress } from "@/lib/contracts/tokens";

export interface PairReserves {
  reserve0: bigint;
  reserve1: bigint;
  blockTimestampLast: number;
}

export interface UsePairResult {
  pairAddress: `0x${string}` | null;
  token0: `0x${string}` | null;
  token1: `0x${string}` | null;
  reserves: PairReserves | null;
  price0CumulativeLast: bigint | null;
  price1CumulativeLast: bigint | null;
  liquidity: bigint | null;
  lpBalance: bigint | null;
  refresh: () => Promise<void>;
}

/**
 * Look up a pair by (tokenA, tokenB), fetch its reserves + cumulative TWAP prices.
 * Spec: contracts/frontend-module-api.md §3, contracts/smart-contract-interfaces.md IUniswapV2Pair.
 */
export function usePair(tokenA: `0x${string}` | null | undefined, tokenB: `0x${string}` | null | undefined): UsePairResult {
  const { provider, chainId, account } = useWeb3Context();
  const [pairAddress, setPairAddress] = useState<`0x${string}` | null>(null);
  const [token0, setToken0] = useState<`0x${string}` | null>(null);
  const [token1, setToken1] = useState<`0x${string}` | null>(null);
  const [reserves, setReserves] = useState<PairReserves | null>(null);
  const [price0CumulativeLast, setPrice0CumulativeLast] = useState<bigint | null>(null);
  const [price1CumulativeLast, setPrice1CumulativeLast] = useState<bigint | null>(null);
  const [liquidity, setLiquidity] = useState<bigint | null>(null);
  const [lpBalance, setLpBalance] = useState<bigint | null>(null);

  const refresh = useCallback(async () => {
    if (!tokenA || !tokenB || !provider || chainId === null) {
      setPairAddress(null);
      return;
    }
    const deployment = getDeployment(chainId);
    if (!deployment || !isValidAddress(deployment.factory)) {
      setPairAddress(null);
      return;
    }
    const factory = new Contract(deployment.factory, IUniswapV2Factory_ABI, provider);
    try {
      const addr = (await factory.getPair(tokenA, tokenB)) as `0x${string}`;
      if (addr === ZeroAddress) {
        setPairAddress(null);
        setReserves(null);
        return;
      }
      setPairAddress(addr);

      const pair = new Contract(addr, IUniswapV2Pair_ABI, provider);
      const [t0, t1, res, p0, p1, supply, bal] = await Promise.all([
        pair.token0(),
        pair.token1(),
        pair.getReserves(),
        pair.price0CumulativeLast(),
        pair.price1CumulativeLast(),
        pair.totalSupply(),
        account ? pair.balanceOf(account) : Promise.resolve(0n),
      ]);
      setToken0(t0 as `0x${string}`);
      setToken1(t1 as `0x${string}`);
      setReserves({
        reserve0: res[0] as bigint,
        reserve1: res[1] as bigint,
        blockTimestampLast: Number(res[2]),
      });
      setPrice0CumulativeLast(p0 as bigint);
      setPrice1CumulativeLast(p1 as bigint);
      setLiquidity(supply as bigint);
      setLpBalance(bal as bigint);
    } catch {
      setPairAddress(null);
    }
  }, [tokenA, tokenB, provider, chainId, account]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return useMemo(
    () => ({ pairAddress, token0, token1, reserves, price0CumulativeLast, price1CumulativeLast, liquidity, lpBalance, refresh }),
    [pairAddress, token0, token1, reserves, price0CumulativeLast, price1CumulativeLast, liquidity, lpBalance, refresh],
  );
}

/**
 * Uniswap V2 library `getAmountOut` — mirrors the on-chain math exactly.
 * amountIn * 997 * reserveOut / (reserveIn * 1000 + amountIn * 997)
 * Reverts (returns 0n) if reserves are zero.
 */
export function getAmountOut(amountIn: bigint, reserveIn: bigint, reserveOut: bigint): bigint {
  if (amountIn <= 0n) return 0n;
  if (reserveIn <= 0n || reserveOut <= 0n) return 0n;
  const amountInWithFee = amountIn * 997n;
  const numerator = amountInWithFee * reserveOut;
  const denominator = reserveIn * 1000n + amountInWithFee;
  return numerator / denominator;
}

/**
 * Uniswap V2 library `getAmountIn` — inverse of getAmountOut.
 */
export function getAmountIn(amountOut: bigint, reserveIn: bigint, reserveOut: bigint): bigint {
  if (amountOut <= 0n) return 0n;
  if (reserveIn <= 0n || reserveOut <= 0n) return 0n;
  const numerator = reserveIn * amountOut * 1000n;
  const denominator = (reserveOut - amountOut) * 997n;
  return numerator / denominator + 1n;
}

/**
 * Compute the CREATE2 pair address — matches UniswapV2Library.pairFor.
 * The factory's pairCodeHash() is the dynamic init code hash, per R0.4.
 *
 * Salt is keccak256(abi.encodePacked(token0, token1)) — TIGHTLY PACKED
 * (20 bytes each = 40 bytes total), NOT abi.encode (each padded to 32 bytes).
 * The contract uses `keccak256(abi.encodePacked(token0, token1))`.
 */
export function computePairAddress(
  factoryAddress: `0x${string}`,
  tokenA: `0x${string}`,
  tokenB: `0x${string}`,
  initCodeHash: `0x${string}`,
): `0x${string}` {
  const [a, b] = tokenA.toLowerCase() < tokenB.toLowerCase() ? [tokenA, tokenB] : [tokenB, tokenA];
  const salt = keccak256(
    solidityPacked(["address", "address"], [getAddress(a), getAddress(b)]),
  );
  // keccak256(0xff ++ factory ++ salt ++ initCode)
  const packed = ("0xff" +
    factoryAddress.slice(2) +
    salt.slice(2) +
    initCodeHash.slice(2)) as `0x${string}`;
  return getAddress("0x" + keccak256(packed).slice(-40)) as `0x${string}`;
}

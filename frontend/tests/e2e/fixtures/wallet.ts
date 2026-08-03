// eslint-disable-next-line @typescript-eslint/ban-ts-comment -- EIP-1193 payloads are intentionally dynamic in this fixture.
// @ts-nocheck
/**
 * EIP-1193 wallet mock for Playwright E2E.
 * Injects window.ethereum, signs txs + EIP-2612 permits with a known anvil key.
 */
import { Wallet, JsonRpcProvider, Contract } from "ethers";
import type { Page } from "@playwright/test";
import { getDeployment } from "../../../src/lib/contracts/addresses";
import {
  IUniswapV2Pair_ABI,
  IUniswapV2Factory_ABI,
  IERC20_ABI,
} from "../../../src/lib/contracts/abis";

const ANVIL_RPC = "http://127.0.0.1:8545";
const CHAIN_ID = 31337;
const CHAIN_ID_HEX = "0x7a69";
const DEPLOYER_PK =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
export const DEPLOYER_ADDR = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

/** Anvil account #2 (swapper, no LP). */
export const ACCOUNT2_PK =
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a";
export const ACCOUNT2_ADDR = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";

export const anvilProvider = new JsonRpcProvider(ANVIL_RPC);
export const deployerWallet = new Wallet(DEPLOYER_PK, anvilProvider);

function hexToBigInt(v: unknown): bigint | undefined {
  if (v === undefined || v === null || v === "" || v === "0x") return undefined;
  return BigInt(v as string);
}

/**
 * Per-address send queue (within a Playwright worker). Serializes eth_sendTransaction
 * so approve→remove never race on the same anvil nonce.
 */
const sendQueues = new Map<string, Promise<unknown>>();

function enqueueSend<T>(address: string, fn: () => Promise<T>): Promise<T> {
  const key = address.toLowerCase();
  const prev = sendQueues.get(key) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  // Keep queue alive regardless of success/failure
  sendQueues.set(
    key,
    next.then(
      () => undefined,
      () => undefined,
    ),
  );
  return next;
}

/**
 * Sign + broadcast via a fresh provider each time (avoids ethers nonce-cache drift).
 * Uses legacy gasPrice for anvil simplicity.
 */
async function signAndSend(
  pk: string,
  txParams: Record<string, unknown>,
): Promise<string> {
  const provider = new JsonRpcProvider(ANVIL_RPC);
  const wallet = new Wallet(pk, provider);
  const from = await wallet.getAddress();

  return enqueueSend(from, async () => {
    const nonce = await provider.getTransactionCount(from, "pending");

    const gas = hexToBigInt(txParams.gas);
    const value = hexToBigInt(txParams.value) ?? 0n;
    const chainId = hexToBigInt(txParams.chainId);

    const txRequest: Record<string, unknown> = {
      to: txParams.to as string | undefined,
      data: (txParams.data as string | undefined) ?? "0x",
      value,
      nonce,
      // Prefer browser gas limit; fall back to a generous default for router burns
      gasLimit: gas ?? 800_000n,
      chainId: chainId !== undefined ? Number(chainId) : CHAIN_ID,
      // Legacy tx type — anvil accepts this; avoids EIP-1559 fee-oracle races
      gasPrice: hexToBigInt(txParams.gasPrice) ?? 1_000_000_000n,
    };

    const tx = await wallet.sendTransaction(txRequest);
    const receipt = await tx.wait(1);
    if (!receipt) {
      throw new Error(`Transaction ${tx.hash} was not mined`);
    }
    return tx.hash;
  });
}

/**
 * Inject an EIP-1193 mock wallet into the page before any app scripts run.
 * Auto-connects via eth_accounts → Web3Provider silentReconnect → status "ready".
 */
export async function injectWallet(
  page: Page,
  opts?: {
    chainId?: number;
    rejectNext?: boolean;
    privateKey?: string;
    address?: string;
  },
): Promise<void> {
  const pk = opts?.privateKey ?? DEPLOYER_PK;
  const address = opts?.address ?? DEPLOYER_ADDR;
  const chainIdNum = opts?.chainId ?? CHAIN_ID;
  const chainIdHex =
    chainIdNum === CHAIN_ID ? CHAIN_ID_HEX : "0x" + chainIdNum.toString(16);

  const wallet = new Wallet(pk);

  await page.exposeFunction(
    "__walletSendTransaction",
    async (txParams: Record<string, unknown>): Promise<string> => {
      return signAndSend(pk, txParams);
    },
  );

  await page.exposeFunction(
    "__walletSignTypedDataV4",
    async (_address: string, typedDataJson: string): Promise<string> => {
      const typedData = JSON.parse(typedDataJson);
      const { domain, message, primaryType } = typedData;
      const types = { ...typedData.types };
      delete types.EIP712Domain;
      void primaryType;
      return await wallet.signTypedData(domain, types, message);
    },
  );

  await page.exposeFunction(
    "__walletPersonalSign",
    async (message: string, _address: string): Promise<string> => {
      if (typeof message === "string" && message.startsWith("0x")) {
        const { getBytes } = await import("ethers");
        return await wallet.signMessage(getBytes(message));
      }
      return await wallet.signMessage(message);
    },
  );

  await page.exposeFunction(
    "__walletRpcForward",
    async (method: string, params: unknown[]): Promise<unknown> => {
      const res = await fetch(ANVIL_RPC, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method,
          params: params ?? [],
        }),
      });
      const json = (await res.json()) as {
        result?: unknown;
        error?: { message?: string };
      };
      if (json.error) {
        throw new Error(json.error.message ?? "RPC error");
      }
      return json.result;
    },
  );

  await page.addInitScript(
    ({ address: addr, chainIdHex: cidHex, rejectNext }) => {
      const listeners: Record<string, Set<(...args: unknown[]) => void>> = {};

      // @ts-expect-error — test-only globals
      window.__walletRejectNext = !!rejectNext;

      // @ts-expect-error — inject EIP-1193 provider
      window.ethereum = {
        isMetaMask: true,
        isConnected: () => true,
        request: async ({
          method,
          params,
        }: {
          method: string;
          params?: unknown[];
        }) => {
          // Only reject user-facing sign/send prompts — NOT eth_call / eth_estimateGas /
          // eth_chainId. Background react-query polls would otherwise consume rejectNext
          // before the approve/remove popup, leaving the real tx to proceed.
          const isUserPrompt =
            method === "eth_sendTransaction" ||
            method === "eth_signTypedData_v4" ||
            method === "eth_signTypedData" ||
            method === "personal_sign" ||
            method === "eth_sign";

          // @ts-expect-error — test flag
          if (window.__walletRejectNext && isUserPrompt) {
            // @ts-expect-error — test flag
            window.__walletRejectNext = false;
            const e = new Error("User rejected the request") as Error & {
              code: number;
            };
            e.code = 4001;
            throw e;
          }

          switch (method) {
            case "eth_requestAccounts":
            case "eth_accounts":
              return [addr];
            case "eth_chainId":
              return cidHex;
            case "eth_sendTransaction":
              // @ts-expect-error — exposeFunction bridge
              return await window.__walletSendTransaction(
                (params as unknown[])[0],
              );
            case "eth_signTypedData_v4":
              // @ts-expect-error — exposeFunction bridge
              return await window.__walletSignTypedDataV4(
                (params as unknown[])[0],
                (params as unknown[])[1],
              );
            case "personal_sign":
              // @ts-expect-error — exposeFunction bridge
              return await window.__walletPersonalSign(
                (params as unknown[])[0],
                (params as unknown[])[1],
              );
            case "wallet_switchEthereumChain":
            case "wallet_addEthereumChain":
            case "wallet_revokePermissions":
              return null;
            default:
              // @ts-expect-error — exposeFunction bridge
              return await window.__walletRpcForward(method, params ?? []);
          }
        },
        on: (event: string, handler: (...args: unknown[]) => void) => {
          if (!listeners[event]) listeners[event] = new Set();
          listeners[event].add(handler);
        },
        removeListener: (
          event: string,
          handler: (...args: unknown[]) => void,
        ) => {
          listeners[event]?.delete(handler);
        },
        __emit: (event: string, ...args: unknown[]) => {
          listeners[event]?.forEach((h) => h(...args));
        },
      };
    },
    {
      address,
      chainIdHex,
      rejectNext: !!opts?.rejectNext,
    },
  );
}

export async function getPairAddress(
  tokenA: string,
  tokenB: string,
): Promise<string> {
  const dep = getDeployment(CHAIN_ID);
  if (!dep) throw new Error("No deployment for chain 31337");
  const factory = new Contract(
    dep.factory,
    IUniswapV2Factory_ABI,
    anvilProvider,
  );
  return (await factory.getPair(tokenA, tokenB)) as string;
}

export async function getLpBalance(
  pair: string,
  account: string,
): Promise<bigint> {
  const c = new Contract(pair, IUniswapV2Pair_ABI, anvilProvider);
  return (await c.balanceOf(account)) as bigint;
}

export async function getTokenBalance(
  token: string,
  account: string,
): Promise<bigint> {
  const c = new Contract(token, IERC20_ABI, anvilProvider);
  return (await c.balanceOf(account)) as bigint;
}

export async function getReserves(
  pair: string,
): Promise<{ reserve0: bigint; reserve1: bigint }> {
  const c = new Contract(pair, IUniswapV2Pair_ABI, anvilProvider);
  const r = await c.getReserves();
  return { reserve0: r[0] as bigint, reserve1: r[1] as bigint };
}

export async function getTotalSupply(pair: string): Promise<bigint> {
  const c = new Contract(pair, IUniswapV2Pair_ABI, anvilProvider);
  return (await c.totalSupply()) as bigint;
}

export async function getNonce(
  pair: string,
  account: string,
): Promise<bigint> {
  const c = new Contract(pair, IUniswapV2Pair_ABI, anvilProvider);
  return (await c.nonces(account)) as bigint;
}

export async function getToken0(pair: string): Promise<string> {
  const c = new Contract(pair, IUniswapV2Pair_ABI, anvilProvider);
  return (await c.token0()) as string;
}

export async function setRejectNext(
  page: Page,
  value: boolean,
): Promise<void> {
  await page.evaluate((v) => {
    // @ts-expect-error — test flag
    window.__walletRejectNext = v;
  }, value);
}

export async function emitAccountsChanged(
  page: Page,
  accounts: string[],
): Promise<void> {
  await page.evaluate((a) => {
    // @ts-expect-error — test helper on ethereum
    window.ethereum.__emit("accountsChanged", a);
  }, accounts);
}

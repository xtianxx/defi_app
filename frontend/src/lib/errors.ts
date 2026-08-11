// Error decoder: maps any thrown error to a canonical ErrorEntry.
// Spec: frontend-module-api.md §7, research.md R0.8, contracts/smart-contract-interfaces.md error selectors.

import { Interface, isError } from "ethers";

export type ErrorCode =
  | "user-rejection"
  | "wallet-missing"
  | "wrong-network"
  | "insufficient-funds"
  | "insufficient-balance"
  | "allowance"
  | "slippage"
  | "deadline"
  | "pool-empty"
  | "gas-estimation"
  | "rpc"
  | "invalid"
  | "internal";

export interface ErrorEntry {
  code: ErrorCode;
  message: string;
  hint?: string;
}

/** Reverse-selector map. Keep in sync with contracts/test/utils/ErrorSelectors.sol. */
const STRING_REVERTS: Record<string, ErrorCode> = {
  "UniswapV2: INSUFFICIENT_OUTPUT_AMOUNT": "slippage",
  "UniswapV2: INSUFFICIENT_INPUT_AMOUNT": "pool-empty",
  "UniswapV2: INSUFFICIENT_LIQUIDITY": "pool-empty",
  "UniswapV2: INSUFFICIENT_LIQUIDITY_MINTED": "pool-empty",
  "UniswapV2: INSUFFICIENT_LIQUIDITY_BURNED": "pool-empty",
  "UniswapV2: EXPIRED": "deadline",
  "UniswapV2: INVALID_SIGNATURE": "invalid",
  "UniswapV2: TRANSFER_FAILED": "insufficient-balance",
  "UniswapV2: K": "internal",
  "UniswapV2: LOCKED": "internal",
  "UniswapV2: FORBIDDEN": "invalid",
  "UniswapV2: OVERFLOW": "internal",
  "UniswapV2: IDENTICAL_ADDRESSES": "invalid",
  "UniswapV2: PAIR_EXISTS": "invalid",
  "UniswapV2: ZERO_ADDRESS": "invalid",
  "UniswapV2Router: INSUFFICIENT_A_AMOUNT": "slippage",
  "UniswapV2Router: INSUFFICIENT_B_AMOUNT": "slippage",
  "UniswapV2: EXCESSIVE_INPUT_AMOUNT": "slippage",
  "UniswapV2Router: INVALID_PATH": "invalid",
  "TransferHelper: TRANSFER_FROM_FAILED": "allowance",
  "WETH9: INSUFFICIENT_BALANCE": "insufficient-balance",
  "WETH9: INSUFFICIENT_ALLOWANCE": "allowance",
  "SafeMath: ADD_OVERFLOW": "internal",
  "SafeMath: SUB_UNDERFLOW": "internal",
  "SafeMath: MUL_OVERFLOW": "internal",
};

const MESSAGES: Record<ErrorCode, { message: string; hint?: string }> = {
  "user-rejection": { message: "Transaction rejected", hint: "You declined the signature in your wallet." },
  "wallet-missing": { message: "Wallet not detected", hint: "Install MetaMask or another EIP-1193 wallet." },
  "wrong-network": { message: "Wrong network", hint: "Switch to a supported chain to continue." },
  "insufficient-funds": {
    message: "Insufficient ETH for gas",
    hint: "The faucet only grants tokens, not ETH. Fund this wallet with test ETH (e.g. from a Sepolia public faucet) to pay for the claim transaction.",
  },
  "insufficient-balance": { message: "Insufficient balance" },
  allowance: { message: "Token allowance too low", hint: "Approve the router to spend this token." },
  slippage: { message: "Slippage exceeded", hint: "Try a higher slippage tolerance or a smaller trade." },
  deadline: { message: "Transaction expired", hint: "The deadline passed before the tx was mined. Try again." },
  "pool-empty": { message: "Pool is empty", hint: "Add liquidity first to enable swaps on this pair." },
  "gas-estimation": { message: "Gas estimation failed", hint: "The transaction would revert. Check inputs and approvals." },
  rpc: { message: "Network error", hint: "RPC request failed or timed out. Try again." },
  invalid: { message: "Invalid request", hint: "Check your inputs and try again." },
  internal: { message: "Internal error", hint: "An unexpected revert occurred. See console for details." },
};

const GENERIC: ErrorEntry = { code: "internal", message: "Unknown error" };

/**
 * Decode a thrown error into a canonical ErrorEntry. Handles:
 * - EIP-1193 user rejection (code 4001)
 * - EIP-1193 wrong-network / disconnected (code 4902, 4900)
 * - ethers CallException with revert reason (string reverts)
 * - Custom errors via Interface.parseError
 * - Plain Error / string / unknown
 */
export function decodeError(err: unknown, _ctx?: { tokenSymbol?: string }): ErrorEntry {
  if (err === null || err === undefined) return GENERIC;

  // 1. EIP-1193 error code (viem/wagmi style or direct from window.ethereum)
  const code = (err as { code?: number | string }).code;
  if (code === 4001 || code === "ACTION_REJECTED") {
    return { code: "user-rejection", ...MESSAGES["user-rejection"] };
  }
  if (code === -32002) {
    return { code: "wallet-missing", ...MESSAGES["wallet-missing"] };
  }
  if (code === 4902 || code === "UNSUPPORTED_OPERATION") {
    return { code: "wrong-network", ...MESSAGES["wrong-network"] };
  }
  if (code === "CALL_EXCEPTION") {
    return decodeCallException(err);
  }
  // ethers INSUFFICIENT_FUNDS (or RPC "insufficient funds") — wallet can't cover gas + value.
  if (code === "INSUFFICIENT_FUNDS") {
    return { code: "insufficient-funds", ...MESSAGES["insufficient-funds"] };
  }

  // 2. String-shaped error (e.g., a direct revert reason).
  if (typeof err === "string") {
    const matched = matchStringRevert(err);
    if (matched) return matched;
    return { code: "invalid", message: err };
  }

  // 3. Error instance with message
  if (err instanceof Error) {
    const matched = matchStringRevert(err.message);
    if (matched) return matched;
    // ethers CallException detection
    if (isError(err, "CALL_EXCEPTION")) {
      return decodeCallException(err);
    }
    // Low-level JSON-RPC errors
    if (isError(err, "NETWORK_ERROR") || /network|timeout|fetch failed/i.test(err.message)) {
      return { code: "rpc", ...MESSAGES.rpc };
    }
    // ethers INSUFFICIENT_FUNDS / RPC "insufficient funds" (wallet can't cover gas + value)
    if (
      code === "INSUFFICIENT_FUNDS" ||
      (typeof err.message === "string" && /insufficient funds/i.test(err.message))
    ) {
      return { code: "insufficient-funds", ...MESSAGES["insufficient-funds"] };
    }
    if (/gas required|estimate gas|out of gas/i.test(err.message)) {
      return { code: "gas-estimation", ...MESSAGES["gas-estimation"] };
    }
    return { code: "internal", message: err.message || GENERIC.message };
  }

  // 4. ethers v6 error data
  if (typeof err === "object" && err !== null && "data" in err) {
    const data = (err as { data?: unknown }).data;
    if (typeof data === "string") {
      const matched = matchStringRevert(data);
      if (matched) return matched;
    }
  }

  return GENERIC;
}

function matchStringRevert(reason: string): ErrorEntry | null {
  // Direct match on the canonical revert strings
  for (const [key, code] of Object.entries(STRING_REVERTS)) {
    if (reason.includes(key)) {
      return { code, ...MESSAGES[code] };
    }
  }
  return null;
}

interface CallExceptionLike {
  reason?: string;
  shortMessage?: string;
  data?: string;
  revert?: { name?: string; signature?: string };
}

function decodeCallException(err: unknown): ErrorEntry {
  const e = err as CallExceptionLike;
  if (e.reason) {
    const matched = matchStringRevert(e.reason);
    if (matched) return matched;
    return { code: "internal", message: e.reason };
  }
  if (e.shortMessage) {
    return { code: "internal", message: e.shortMessage };
  }
  if (e.data && typeof e.data === "string" && e.data !== "0x") {
    const matched = matchStringRevert(e.data);
    if (matched) return matched;
    // Try the Interface-based custom error decoder first.
    const decoded = tryDecodeCustomError(e.data);
    if (decoded) return decoded;
    // Fallback: hardcoded selector for DirectPairOnly (Phase 3 will add it).
    try {
      const selector = e.data.slice(0, 10).toLowerCase();
      if (selector === "0x7e7abf1f") {
        return { code: "invalid", ...MESSAGES.invalid, message: "Direct-pair only (no multi-hop)" };
      }
    } catch {
      /* ignore */
    }
  }
  return GENERIC;
}

/** A minimal ABI fragment list for known contract errors. */
const KNOWN_ERROR_ABI: string[] = [
  "error InsufficientOutputAmount()",
  "error InsufficientInputAmount()",
  "error InsufficientLiquidity()",
  "error Expired()",
  "error InvalidSignature()",
  "error TransferFailed()",
  "error DirectPairOnly()",
];

const errorInterface = new Interface(KNOWN_ERROR_ABI);

export function tryDecodeCustomError(data: string | undefined): ErrorEntry | null {
  if (!data || data === "0x") return null;
  try {
    const parsed = errorInterface.parseError(data);
    if (!parsed) return null;
    const name = parsed.name;
    if (name === "DirectPairOnly") return { code: "invalid", ...MESSAGES.invalid, message: "Direct-pair only (no multi-hop)" };
    if (name === "Expired") return { code: "deadline", ...MESSAGES.deadline };
    if (name === "InsufficientOutputAmount") return { code: "slippage", ...MESSAGES.slippage };
    if (name === "InsufficientInputAmount") return { code: "pool-empty", ...MESSAGES["pool-empty"] };
    if (name === "InsufficientLiquidity") return { code: "pool-empty", ...MESSAGES["pool-empty"] };
    if (name === "InvalidSignature") return { code: "invalid", ...MESSAGES.invalid };
    if (name === "TransferFailed") return { code: "insufficient-balance", ...MESSAGES["insufficient-balance"] };
    return { code: "internal", message: `Custom error: ${name}` };
  } catch {
    return null;
  }
}

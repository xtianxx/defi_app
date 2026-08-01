// Transaction confirmation helper.
// The on-chain receipt is the single source of truth for whether a tx
// succeeded — never a wallet provider's `wait()` outcome alone.

import { type TransactionReceipt, type Provider, type TransactionResponse } from "ethers";

/** How long tx.wait() may run before we stop trusting the wallet's provider. */
const WAIT_TIMEOUT_MS = 120_000;
/** Interval between by-hash receipt re-reads after wait() fails. */
const RE_READ_INTERVAL_MS = 1_500;
/** Number of by-hash re-read attempts before giving up. */
const RE_READ_ATTEMPTS = 5;

/**
 * Wait for a transaction to be mined and return its receipt.
 *
 * ethers' `tx.wait()` polls the wallet's injected provider. MetaMask's provider
 * can throw or hang right after the confirmation popup closes — especially on
 * local chains (Anvil) — even though the tx was already mined successfully.
 * A thrown `wait()` therefore must NOT be treated as an on-chain failure:
 * we re-read the receipt directly by hash before classifying the outcome.
 *
 * Returns the receipt once the tx is confirmed (status 0 or 1), or null when
 * the tx could not be confirmed at all (still pending, dropped, or the RPC
 * stayed unreachable).
 */
export async function waitForReceipt(
  tx: TransactionResponse,
  provider: Provider | null,
): Promise<TransactionReceipt | null> {
  try {
    const receipt = await tx.wait(1, WAIT_TIMEOUT_MS);
    return receipt ?? null;
  } catch (waitErr) {
    console.warn("[waitForReceipt] wait() threw — re-checking by hash:", waitErr);
  }

  for (let i = 0; i < RE_READ_ATTEMPTS; i++) {
    try {
      const receipt = await provider?.getTransactionReceipt(tx.hash);
      if (receipt) return receipt;
    } catch (readErr) {
      console.warn("[waitForReceipt] by-hash receipt read failed:", readErr);
    }
    await new Promise((resolve) => setTimeout(resolve, RE_READ_INTERVAL_MS));
  }
  return null;
}

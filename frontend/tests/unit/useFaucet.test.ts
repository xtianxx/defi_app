import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

// --- Hoisted mocks (vi.mock factories are hoisted above imports) ---
const { useWeb3ContextMock, ContractMock, getDeploymentMock } = vi.hoisted(() => ({
  useWeb3ContextMock: vi.fn(),
  ContractMock: vi.fn(),
  getDeploymentMock: vi.fn(),
}));

vi.mock("@/providers/Web3Context", () => ({
  useWeb3Context: () => useWeb3ContextMock(),
}));

vi.mock("ethers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ethers")>();
  return { ...actual, Contract: ContractMock };
});

vi.mock("@/lib/contracts/addresses", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/contracts/addresses")>();
  return { ...actual, getDeployment: getDeploymentMock };
});

import { useFaucet } from "@/hooks/useFaucet";

// --- Fixed test fixtures ---
const FAUCET_ADDR = "0xfaucet00000000000000000000000000000000000a" as `0x${string}`;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ACCOUNT = "0xaccount000000000000000000000000000000000000a" as `0x${string}`;
const CHAIN_ID = 31337;
const TX_HASH = "0xclaim00000000000000000000000000000000000000000000000000000000000a" as `0x${string}`;
// Deterministic eligibility timestamp (2023-11-14 22:30:00 UTC) for countdown formatting.
const NET_TS = 1700001000n;

const DEFAULT_GRANTS = [
  { symbol: "WETH", amount: "100000000000000000", decimals: 18 },
  { symbol: "USDC", amount: "200000000", decimals: 6 },
  { symbol: "DAI", amount: "200000000000000000000", decimals: 18 },
  { symbol: "WBTC", amount: "1000000", decimals: 8 },
];

// Local-time formatting mirroring the hook's countdown helper (TZ-independent:
// both sides use the same Date-based logic).
function formatLocal(ts: bigint): string {
  const d = new Date(Number(ts) * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface MockTx {
  hash: string;
  wait: () => Promise<{ status: number } | null>;
}

interface MockFaucetContract {
  nextEligibleTime: ReturnType<typeof vi.fn>;
  WETH_AMOUNT: ReturnType<typeof vi.fn>;
  USDC_AMOUNT: ReturnType<typeof vi.fn>;
  DAI_AMOUNT: ReturnType<typeof vi.fn>;
  WBTC_AMOUNT: ReturnType<typeof vi.fn>;
  request: ReturnType<typeof vi.fn>;
}

function makeReceipt(status: number) {
  return { status } as unknown as { status: number };
}

function makeTx(hash: string, waitImpl: () => Promise<{ status: number } | null>): MockTx {
  return { hash, wait: () => waitImpl() };
}

/**
 * Build a fresh mock faucet contract for one test. The hook creates exactly one
 * Contract (the faucet), so every `new Contract(...)` returns this object.
 */
function setupFaucetContract(opts: {
  nextEligibleTime?: bigint;
  requestTx?: MockTx;
  requestThrow?: unknown;
  constants?: { weth?: bigint; usdc?: bigint; dai?: bigint; wbtc?: bigint };
} = {}) {
  const faucetContract: MockFaucetContract = {
    nextEligibleTime: vi.fn(async () => opts.nextEligibleTime ?? 0n),
    WETH_AMOUNT: vi.fn(async () => opts.constants?.weth ?? 100000000000000000n),
    USDC_AMOUNT: vi.fn(async () => opts.constants?.usdc ?? 200000000n),
    DAI_AMOUNT: vi.fn(async () => opts.constants?.dai ?? 200000000000000000000n),
    WBTC_AMOUNT: vi.fn(async () => opts.constants?.wbtc ?? 1000000n),
    request: opts.requestThrow
      ? vi.fn(async () => {
          throw opts.requestThrow;
        })
      : vi.fn(async () => opts.requestTx ?? makeTx(TX_HASH, async () => makeReceipt(1))),
  };
  ContractMock.mockImplementation(() => faucetContract);
  return faucetContract;
}

function setupWeb3(
  overrides: Partial<{
    signer: unknown;
    account: string | null;
    chainId: number | null;
    provider: { getNetwork: ReturnType<typeof vi.fn> };
  }> = {},
) {
  const provider =
    overrides.provider ?? { getNetwork: vi.fn(async () => ({ chainId: BigInt(CHAIN_ID) })) };
  useWeb3ContextMock.mockReturnValue({
    status: "ready",
    account: ACCOUNT,
    chainId: CHAIN_ID,
    chain: null,
    provider,
    signer: { provider },
    error: null,
    connect: vi.fn(),
    switchChain: vi.fn(),
    disconnect: vi.fn(),
    ...overrides,
  });
}

function setupDeployment() {
  getDeploymentMock.mockReturnValue({
    factory: "0xfactory0000000000000000000000000000000000000a",
    router: "0xrouter0000000000000000000000000000000000000a",
    weth: "0xweth000000000000000000000000000000000000000a",
    faucet: FAUCET_ADDR,
    tokens: { WETH: "0xweth000000000000000000000000000000000000000a", USDC: "0xusdc0", DAI: "0xdai0", WBTC: "0xwbtc0" },
  });
}

describe("useFaucet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupWeb3();
    setupDeployment();
    setupFaucetContract();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("starts idle with no tx/error, null nextEligibleTime and default grant amounts", async () => {
    const { result } = renderHook(() => useFaucet());
    await act(async () => {}); // flush view-read effects

    expect(result.current.phase).toBe("idle");
    expect(result.current.txHash).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.nextEligibleTime).toBeNull();
    expect(result.current.grantAmounts).toEqual(DEFAULT_GRANTS);
  });

  it("claim flows idle → claiming → mining → confirmed and refreshes nextEligibleTime", async () => {
    const faucetContract = setupFaucetContract({ nextEligibleTime: 0n });
    const { result } = renderHook(() => useFaucet());
    await waitFor(() => expect(result.current.nextEligibleTime).toBeNull());

    // Defer request() and the receipt wait so we can observe intermediate phases.
    let resolveRequest!: (tx: MockTx) => void;
    let resolveWait!: (r: { status: number } | null) => void;
    const requestPromise = new Promise<MockTx>((r) => {
      resolveRequest = r;
    });
    const waitPromise = new Promise<{ status: number } | null>((r) => {
      resolveWait = r;
    });
    faucetContract.request.mockReturnValue(requestPromise);

    let claimPromise: Promise<void>;
    act(() => {
      claimPromise = result.current.claim();
    });
    await waitFor(() => expect(result.current.phase).toBe("claiming"));

    await act(async () => {
      resolveRequest(makeTx(TX_HASH, () => waitPromise));
    });
    await waitFor(() => expect(result.current.phase).toBe("mining"));
    expect(result.current.txHash).toBe(TX_HASH);

    // The contract now reports eligibility — the post-confirm refresh must pick it up.
    faucetContract.nextEligibleTime.mockResolvedValue(NET_TS);
    await act(async () => {
      resolveWait({ status: 1 });
      await claimPromise;
    });

    expect(result.current.phase).toBe("confirmed");
    expect(result.current.txHash).toBe(TX_HASH);
    expect(result.current.error).toBeNull();
    await waitFor(() => expect(result.current.nextEligibleTime).toBe(NET_TS));
  });

  it("maps a rate-limited revert to the countdown message", async () => {
    const faucetContract = setupFaucetContract({ nextEligibleTime: NET_TS });
    const { result } = renderHook(() => useFaucet());
    await waitFor(() => expect(result.current.nextEligibleTime).toBe(NET_TS));

    faucetContract.request.mockRejectedValue(
      Object.assign(new Error("execution reverted: DemoFaucet: rate limited"), {
        code: "CALL_EXCEPTION",
        reason: "DemoFaucet: rate limited",
      }),
    );

    await act(async () => {
      await result.current.claim();
    });

    expect(result.current.phase).toBe("error");
    expect(result.current.error?.code).toBe("internal");
    expect(result.current.error?.message).toBe(
      `本钱包 24 小时内已领取过 — 下次可领取时间: ${formatLocal(NET_TS)}`,
    );
  });

  it("maps a weth-reserve-empty revert to the reseed message", async () => {
    const faucetContract = setupFaucetContract({ nextEligibleTime: NET_TS });
    const { result } = renderHook(() => useFaucet());
    await waitFor(() => expect(result.current.nextEligibleTime).toBe(NET_TS));

    faucetContract.request.mockRejectedValue(
      Object.assign(new Error("execution reverted: DemoFaucet: weth reserve empty"), {
        code: "CALL_EXCEPTION",
        reason: "DemoFaucet: weth reserve empty",
      }),
    );

    await act(async () => {
      await result.current.claim();
    });

    expect(result.current.phase).toBe("error");
    expect(result.current.error?.message).toBe("WETH 储备不足，请联系演示者补充");
  });

  it("gates claim with wallet-missing when not connected", async () => {
    setupWeb3({ signer: null, account: null, chainId: null });
    setupFaucetContract();
    const { result } = renderHook(() => useFaucet());

    await act(async () => {
      await result.current.claim();
    });

    expect(result.current.phase).toBe("error");
    expect(result.current.error?.code).toBe("wallet-missing");
  });

  it("gates claim with wrong-network when signer is on a different chain", async () => {
    const provider = { getNetwork: vi.fn(async () => ({ chainId: 1n })) };
    setupWeb3({ signer: { provider }, provider });
    setupFaucetContract();
    const { result } = renderHook(() => useFaucet());

    await act(async () => {
      await result.current.claim();
    });

    expect(result.current.phase).toBe("error");
    expect(result.current.error?.code).toBe("wrong-network");
    expect(result.current.error?.message).toBe(`Wallet is on chain 1, expected ${CHAIN_ID}`);
  });

  it("gates claim when the faucet is not deployed for the chain", async () => {
    getDeploymentMock.mockReturnValue({
      factory: "0xfactory0000000000000000000000000000000000000a",
      router: "0xrouter0000000000000000000000000000000000000a",
      weth: "0xweth000000000000000000000000000000000000000a",
      faucet: ZERO_ADDRESS,
      tokens: { WETH: "0xweth000000000000000000000000000000000000000a", USDC: "0xusdc0", DAI: "0xdai0", WBTC: "0xwbtc0" },
    });
    setupFaucetContract();
    const { result } = renderHook(() => useFaucet());

    await act(async () => {
      await result.current.claim();
    });

    expect(result.current.phase).toBe("error");
    expect(result.current.error?.code).toBe("invalid");
    expect(result.current.error?.message).toBe("Faucet not deployed for this chain");
  });

  it("sets phase=rejected with no error when user rejects (code 4001)", async () => {
    const faucetContract = setupFaucetContract();
    faucetContract.request.mockRejectedValue({ code: 4001, message: "User rejected" });
    const { result } = renderHook(() => useFaucet());

    await act(async () => {
      await result.current.claim();
    });

    expect(result.current.phase).toBe("rejected");
    expect(result.current.error).toBeNull();
  });

  it("reset clears phase/txHash/error but keeps nextEligibleTime and grantAmounts", async () => {
    setupFaucetContract({ nextEligibleTime: NET_TS });
    const { result } = renderHook(() => useFaucet());
    await waitFor(() => expect(result.current.nextEligibleTime).toBe(NET_TS));

    await act(async () => {
      await result.current.claim();
    });
    expect(result.current.phase).toBe("confirmed");
    expect(result.current.txHash).toBe(TX_HASH);

    act(() => {
      result.current.reset();
    });

    expect(result.current.phase).toBe("idle");
    expect(result.current.txHash).toBeNull();
    expect(result.current.error).toBeNull();
    // Reset must NOT clear the view-backed state.
    expect(result.current.nextEligibleTime).toBe(NET_TS);
    expect(result.current.grantAmounts).toEqual(DEFAULT_GRANTS);
  });

  it("maps nextEligibleTime view 0 to null (never requested / eligible now)", async () => {
    const faucetContract = setupFaucetContract({ nextEligibleTime: 0n });
    const { result } = renderHook(() => useFaucet());

    await waitFor(() => expect(result.current.nextEligibleTime).toBeNull());
    expect(faucetContract.nextEligibleTime).toHaveBeenCalledWith(ACCOUNT);
  });

  it("maps nextEligibleTime view timestamp to the raw bigint", async () => {
    setupFaucetContract({ nextEligibleTime: NET_TS });
    const { result } = renderHook(() => useFaucet());

    await waitFor(() => expect(result.current.nextEligibleTime).toBe(NET_TS));
  });

  it("returns null nextEligibleTime when not connected", async () => {
    setupWeb3({ signer: null, account: null, chainId: null });
    setupFaucetContract();
    const { result } = renderHook(() => useFaucet());

    await act(async () => {});
    expect(result.current.nextEligibleTime).toBeNull();
  });

  it("returns static default grant amounts when not connected", async () => {
    setupWeb3({ signer: null, account: null, chainId: null });
    setupFaucetContract();
    const { result } = renderHook(() => useFaucet());

    await act(async () => {});
    expect(result.current.grantAmounts).toEqual(DEFAULT_GRANTS);
  });

  it("reads grant amounts from contract constants when connected", async () => {
    setupFaucetContract({
      constants: { weth: 123n, usdc: 456n, dai: 789n, wbtc: 1011n },
    });
    const { result } = renderHook(() => useFaucet());

    await waitFor(() =>
      expect(result.current.grantAmounts).toEqual([
        { symbol: "WETH", amount: "123", decimals: 18 },
        { symbol: "USDC", amount: "456", decimals: 6 },
        { symbol: "DAI", amount: "789", decimals: 18 },
        { symbol: "WBTC", amount: "1011", decimals: 8 },
      ]),
    );
  });
});

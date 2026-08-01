import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { ReactNode } from "react";
import { Web3Provider, useWeb3Context } from "@/providers/Web3Provider";

function setEthereum(eth: unknown) {
  if (eth) {
    (window as unknown as { ethereum: unknown }).ethereum = eth;
  } else {
    delete (window as unknown as { ethereum?: unknown }).ethereum;
  }
}

describe("useWeb3", () => {
  beforeEach(() => {
    setEthereum(null);
  });

  afterEach(() => {
    setEthereum(null);
    vi.restoreAllMocks();
  });

  it("starts in idle state with no account when no wallet is injected", () => {
    const { result } = renderHook(() => useWeb3Context(), {
      wrapper: ({ children }: { children: ReactNode }) => <Web3Provider>{children}</Web3Provider>,
    });
    expect(result.current.status).toBe("idle");
    expect(result.current.account).toBeNull();
    expect(result.current.provider).toBeNull();
    expect(result.current.signer).toBeNull();
  });

  it("connect surfaces a wallet-missing error when window.ethereum is undefined", async () => {
    const { result } = renderHook(() => useWeb3Context(), {
      wrapper: ({ children }: { children: ReactNode }) => <Web3Provider>{children}</Web3Provider>,
    });
    await act(async () => {
      await result.current.connect();
    });
    expect(result.current.status).toBe("error");
    expect(result.current.error?.code).toBe("wallet-missing");
  });

  it("disconnect clears account and returns to idle from any state", () => {
    const { result } = renderHook(() => useWeb3Context(), {
      wrapper: ({ children }: { children: ReactNode }) => <Web3Provider>{children}</Web3Provider>,
    });
    act(() => {
      result.current.disconnect();
    });
    expect(result.current.status).toBe("idle");
    expect(result.current.account).toBeNull();
  });

  it("connect on a stub ethereum provider surfaces an error entry", async () => {
    // Minimal stub — request throws immediately to test the error path.
    setEthereum({
      request: vi.fn(async () => {
        throw Object.assign(new Error("User rejected the request"), { code: 4001 });
      }),
      on: vi.fn(),
      removeListener: vi.fn(),
    });
    const { result } = renderHook(() => useWeb3Context(), {
      wrapper: ({ children }: { children: ReactNode }) => <Web3Provider>{children}</Web3Provider>,
    });
    await act(async () => {
      await result.current.connect();
    });
    expect(result.current.status).toBe("error");
    expect(result.current.error?.code).toBe("user-rejection");
  });
});

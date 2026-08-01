import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, act, fireEvent, waitFor } from "@testing-library/react";
import { Web3Provider, useWeb3Context } from "@/providers/Web3Provider";

function ContextInspector() {
  const ctx = useWeb3Context();
  return (
    <div>
      <span data-testid="status">{ctx.status}</span>
      <span data-testid="account">{ctx.account ?? "null"}</span>
      <span data-testid="chainId">{ctx.chainId ?? "null"}</span>
      <button onClick={() => void ctx.disconnect()}>disconnect</button>
    </div>
  );
}

const ACCOUNT = "0x1234567890123456789012345678901234567890";

/** Minimal EIP-1193 mock that lets silentReconnect + disconnect work. */
function mockEthereum(requestImpl: (args: { method: string; params?: unknown[] }) => unknown) {
  const request = vi.fn(async (args: { method: string; params?: unknown[] }) => requestImpl(args));
  (window as unknown as { ethereum: unknown }).ethereum = {
    request,
    on: vi.fn(),
    removeListener: vi.fn(),
  };
  return request;
}

describe("Web3Provider", () => {
  afterEach(() => {
    cleanup();
    delete (window as unknown as { ethereum?: unknown }).ethereum;
    vi.restoreAllMocks();
  });

  it("renders children", () => {
    render(
      <Web3Provider>
        <p>hello</p>
      </Web3Provider>,
    );
    expect(screen.getByText("hello")).toBeInTheDocument();
  });

  it("exposes the default context (idle, no account, no chain)", () => {
    render(
      <Web3Provider>
        <ContextInspector />
      </Web3Provider>,
    );
    expect(screen.getByTestId("status").textContent).toBe("idle");
    expect(screen.getByTestId("account").textContent).toBe("null");
    expect(screen.getByTestId("chainId").textContent).toBe("null");
  });

  it("returns a no-op default context when used outside the provider (SSR fallback)", () => {
    // Render without a wrapper — useWeb3Context returns the noop default.
    render(<ContextInspector />);
    expect(screen.getByTestId("status").textContent).toBe("idle");
    expect(screen.getByTestId("account").textContent).toBe("null");
  });

  it("silently reconnects via eth_accounts when the site already has permission", async () => {
    mockEthereum(({ method }) => {
      if (method === "eth_accounts") return [ACCOUNT];
      if (method === "eth_chainId") return "0x7a69";
      return null;
    });

    render(
      <Web3Provider>
        <ContextInspector />
      </Web3Provider>,
    );

    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("ready"));
    expect(screen.getByTestId("account").textContent).toBe(ACCOUNT);
    expect(screen.getByTestId("chainId").textContent).toBe("31337");
  });

  it("disconnect clears local state and revokes the eth_accounts permission", async () => {
    const request = mockEthereum(({ method }) => {
      if (method === "eth_accounts") return [ACCOUNT];
      if (method === "eth_chainId") return "0x7a69";
      if (method === "wallet_revokePermissions") return [];
      return null;
    });

    render(
      <Web3Provider>
        <ContextInspector />
      </Web3Provider>,
    );
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("ready"));

    fireEvent.click(screen.getByRole("button", { name: "disconnect" }));

    // Local state clears immediately, without waiting for the revoke popup.
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("idle"));
    expect(screen.getByTestId("account").textContent).toBe("null");
    // And the site permission is revoked so the next load does NOT reconnect.
    await waitFor(() =>
      expect(request).toHaveBeenCalledWith({
        method: "wallet_revokePermissions",
        params: [{ eth_accounts: {} }],
      }),
    );
  });

  it("disconnect tolerates wallets that do not support wallet_revokePermissions", async () => {
    // The provider logs the unsupported-method failure as an expected warning
    // (production diagnostics) — silence it so the test output stays clean.
    // (vi.restoreAllMocks in afterEach restores console.warn.)
    vi.spyOn(console, "warn").mockImplementation(() => {});

    mockEthereum(({ method }) => {
      if (method === "eth_accounts") return [ACCOUNT];
      if (method === "eth_chainId") return "0x7a69";
      if (method === "wallet_revokePermissions") {
        throw new Error("Method not found");
      }
      return null;
    });

    render(
      <Web3Provider>
        <ContextInspector />
      </Web3Provider>,
    );
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("ready"));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "disconnect" }));
      // give the revoke rejection a tick to propagate
      await Promise.resolve();
    });

    expect(screen.getByTestId("status").textContent).toBe("idle");
    expect(screen.getByTestId("account").textContent).toBe("null");
  });

  it("disconnect without a prior connection does not call wallet_revokePermissions", () => {
    const request = mockEthereum(({ method }) => {
      if (method === "eth_accounts") return [];
      return null;
    });

    render(
      <Web3Provider>
        <ContextInspector />
      </Web3Provider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "disconnect" }));

    expect(
      request.mock.calls.some(([args]) => args.method === "wallet_revokePermissions"),
    ).toBe(false);
    expect(screen.getByTestId("status").textContent).toBe("idle");
  });
});

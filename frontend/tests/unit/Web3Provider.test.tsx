import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Web3Provider, useWeb3Context } from "@/providers/Web3Provider";

function ContextInspector() {
  const ctx = useWeb3Context();
  return (
    <div>
      <span data-testid="status">{ctx.status}</span>
      <span data-testid="account">{ctx.account ?? "null"}</span>
      <span data-testid="chainId">{ctx.chainId ?? "null"}</span>
    </div>
  );
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
});

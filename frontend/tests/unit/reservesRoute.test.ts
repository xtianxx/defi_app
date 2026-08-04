// Unit tests for GET /api/reserves (T059 part 2, T061).
// Core logic is tested via the exported uncached `fetchReserves`; the GET
// handler is tested for status codes, headers and param validation.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --- Hoisted mocks (vi.mock factories are hoisted above imports) ---
const { createServerProviderMock, ContractMock } = vi.hoisted(() => ({
  createServerProviderMock: vi.fn(),
  ContractMock: vi.fn(),
}));

vi.mock("@/lib/rpc", () => ({
  createServerProvider: (...args: unknown[]) => createServerProviderMock(...args),
}));

vi.mock("ethers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ethers")>();
  return { ...actual, Contract: ContractMock };
});

import { GET, PairNotFoundError, fetchReserves } from "@/app/api/reserves/route";

const PAIR = "0xpair00000000000000000000000000000000000000aa";
const ACCOUNT = "0xaccount000000000000000000000000000000000000a";
const CHAIN_ID = 31337;

const RESERVES = [1000n * 10n ** 18n, 2000n * 10n ** 18n, 123n];
const CODE = "0x600d600d600d";

const providerMock = {
  getCode: vi.fn(),
};

function setupPairMocks(getCodeImpl: () => Promise<string> = async () => CODE) {
  createServerProviderMock.mockReturnValue(providerMock);
  providerMock.getCode.mockImplementation(getCodeImpl);
  ContractMock.mockImplementation(() => ({
    getReserves: vi.fn(async () => [...RESERVES]),
    price0CumulativeLast: vi.fn(async () => 999n),
    price1CumulativeLast: vi.fn(async () => 888n),
    totalSupply: vi.fn(async () => 5000n),
    balanceOf: vi.fn(async () => 77n),
  }));
}

describe("api/reserves route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupPairMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetchReserves returns all fields with bigint values serialized as strings", async () => {
    const data = await fetchReserves(PAIR, ACCOUNT, CHAIN_ID);

    expect(data).toEqual({
      reserve0: "1000000000000000000000",
      reserve1: "2000000000000000000000",
      blockTimestampLast: 123,
      price0CumulativeLast: "999",
      price1CumulativeLast: "888",
      totalSupply: "5000",
      lpBalance: "77",
    });
    expect(createServerProviderMock).toHaveBeenCalledWith(CHAIN_ID);
    expect(providerMock.getCode).toHaveBeenCalledWith(PAIR);
    expect(ContractMock).toHaveBeenCalledWith(PAIR, expect.anything(), providerMock);
  });

  it("GET returns 200 with the Cache-Control header", async () => {
    const res = await GET(
      new Request(`http://localhost:3000/api/reserves?pair=${PAIR}&account=${ACCOUNT}`),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe(
      "public, s-maxage=2, stale-while-revalidate=4",
    );
    const body = await res.json();
    expect(body.reserve0).toBe("1000000000000000000000");
    expect(body.price1CumulativeLast).toBe("888");
    expect(body.lpBalance).toBe("77");
  });

  it("GET returns 400 when pair or account is missing", async () => {
    const missingPair = await GET(
      new Request(`http://localhost:3000/api/reserves?account=${ACCOUNT}`),
    );
    expect(missingPair.status).toBe(400);
    expect(await missingPair.json()).toEqual({ error: "missing pair or account" });

    const missingAccount = await GET(
      new Request(`http://localhost:3000/api/reserves?pair=${PAIR}`),
    );
    expect(missingAccount.status).toBe(400);
    expect(await missingAccount.json()).toEqual({ error: "missing pair or account" });
  });

  it("fetchReserves rejects with PairNotFoundError when the pair has no code", async () => {
    setupPairMocks(async () => "0x");

    await expect(fetchReserves(PAIR, ACCOUNT, CHAIN_ID)).rejects.toBeInstanceOf(
      PairNotFoundError,
    );
  });

  it("GET returns 404 when the pair has no code deployed", async () => {
    setupPairMocks(async () => "0x");

    const res = await GET(
      new Request(`http://localhost:3000/api/reserves?pair=${PAIR}&account=${ACCOUNT}`),
    );

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "pair not found" });
  });

  it("GET returns 502 with Retry-After on RPC errors", async () => {
    setupPairMocks(async () => {
      throw new Error("connection refused");
    });

    const res = await GET(
      new Request(`http://localhost:3000/api/reserves?pair=${PAIR}&account=${ACCOUNT}`),
    );

    expect(res.status).toBe(502);
    expect(res.headers.get("Retry-After")).toBe("2");
    expect(await res.json()).toEqual({ error: "rpc error", detail: "connection refused" });
  });
});

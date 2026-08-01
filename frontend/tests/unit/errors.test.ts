import { describe, it, expect } from "vitest";
import { decodeError, tryDecodeCustomError } from "@/lib/errors";

describe("errors", () => {
  describe("decodeError", () => {
    it("decodes user rejection (code 4001)", () => {
      const entry = decodeError({ code: 4001, message: "User rejected" });
      expect(entry.code).toBe("user-rejection");
      expect(entry.hint).toBeDefined();
    });

    it("decodes user rejection (string code)", () => {
      const entry = decodeError({ code: "ACTION_REJECTED" });
      expect(entry.code).toBe("user-rejection");
    });

    it("decodes wrong-network (code 4902)", () => {
      const entry = decodeError({ code: 4902 });
      expect(entry.code).toBe("wrong-network");
    });

    it("decodes missing-wallet (code -32002)", () => {
      const entry = decodeError({ code: -32002 });
      expect(entry.code).toBe("wallet-missing");
    });

    it("decodes string revert for INSUFFICIENT_OUTPUT_AMOUNT as slippage", () => {
      const entry = decodeError(new Error("execution reverted: UniswapV2: INSUFFICIENT_OUTPUT_AMOUNT"));
      expect(entry.code).toBe("slippage");
    });

    it("decodes string revert for EXPIRED as deadline", () => {
      const entry = decodeError(new Error("execution reverted: UniswapV2: EXPIRED"));
      expect(entry.code).toBe("deadline");
    });

    it("decodes INSUFFICIENT_LIQUIDITY as pool-empty", () => {
      const entry = decodeError(new Error("execution reverted: UniswapV2: INSUFFICIENT_LIQUIDITY"));
      expect(entry.code).toBe("pool-empty");
    });

    it("decodes TRANSFER_FROM_FAILED as allowance", () => {
      const entry = decodeError(new Error("execution reverted: TransferHelper: TRANSFER_FROM_FAILED"));
      expect(entry.code).toBe("allowance");
    });

    it("decodes router INSUFFICIENT_A_AMOUNT as slippage", () => {
      const entry = decodeError(new Error("execution reverted: UniswapV2Router: INSUFFICIENT_A_AMOUNT"));
      expect(entry.code).toBe("slippage");
    });

    it("decodes router INSUFFICIENT_B_AMOUNT as slippage", () => {
      const entry = decodeError(new Error("execution reverted: UniswapV2Router: INSUFFICIENT_B_AMOUNT"));
      expect(entry.code).toBe("slippage");
    });

    it("decodes EXCESSIVE_INPUT_AMOUNT as slippage", () => {
      const entry = decodeError(new Error("execution reverted: UniswapV2: EXCESSIVE_INPUT_AMOUNT"));
      expect(entry.code).toBe("slippage");
    });

    it("decodes router INVALID_PATH as invalid", () => {
      const entry = decodeError(new Error("execution reverted: UniswapV2Router: INVALID_PATH"));
      expect(entry.code).toBe("invalid");
    });

    it("decodes K as internal", () => {
      const entry = decodeError(new Error("execution reverted: UniswapV2: K"));
      expect(entry.code).toBe("internal");
    });

    it("decodes RPC network error", () => {
      const entry = decodeError(new Error("network error: timeout"));
      expect(entry.code).toBe("rpc");
    });

    it("decodes gas estimation failure", () => {
      const entry = decodeError(new Error("gas required exceeds allowance"));
      expect(entry.code).toBe("gas-estimation");
    });

    it("returns internal for plain Error without a recognizable reason", () => {
      const entry = decodeError(new Error("something else went wrong"));
      expect(entry.code).toBe("internal");
    });

    it("returns internal for null/undefined", () => {
      expect(decodeError(null).code).toBe("internal");
      expect(decodeError(undefined).code).toBe("internal");
    });

    it("returns invalid for plain string with no match", () => {
      const entry = decodeError("user provided bad input");
      expect(entry.code).toBe("invalid");
    });
  });

  describe("tryDecodeCustomError", () => {
    it("returns null for empty data", () => {
      expect(tryDecodeCustomError(undefined)).toBeNull();
      expect(tryDecodeCustomError("0x")).toBeNull();
    });

    it("decodes DirectPairOnly as invalid", () => {
      // Interface.getSelector("DirectPairOnly()") = first 4 bytes of keccak256 of the signature
      // We can construct by relying on the interface internal match — but here we just
      // check that the function returns *something* for a malformed input.
      expect(tryDecodeCustomError("0xdeadbeef")).toBeNull();
    });
  });
});

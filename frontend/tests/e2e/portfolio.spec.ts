// eslint-disable-next-line @typescript-eslint/ban-ts-comment -- E2E wallet fixture types are intentionally dynamic.
// @ts-nocheck
/**
 * Phase 6 (US4) — Portfolio Playwright E2E suite (T060).
 * Checklist: specs/001-uniswap-v2-resume/checklists/e2e-phase6.md
 *
 * Runs against anvil + DeployDemo, which seeds WETH/USDC + WETH/DAI LP to the
 * deployer (account #0) and leaves Mint events for the deployer's history.
 * portfolio.spec.ts sorts BEFORE the destructive remove-liquidity suite, so
 * the two seeded positions are intact when these assertions execute.
 *
 * This file performs no wallet writes — all assertions are reads, so it is
 * safe to run in parallel with other spec files (no nonce races).
 */
import { test, expect } from "@playwright/test";
import {
  injectWallet,
  ACCOUNT2_PK,
  ACCOUNT2_ADDR,
} from "./fixtures/wallet";

test.describe("US4 Portfolio — connected deployer", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(60_000);

  test.beforeEach(async ({ page }) => {
    await injectWallet(page);
  });

  test("E2E-US4-01 Portfolio interactive < 3s (SC-004) with 2 seeded positions", async ({
    page,
  }) => {
    // Warm-up: the first dev-server compile of /portfolio can exceed 3s (Next
    // on-demand compilation). SC-004 is measured on a warm reload: from
    // navigation start until the first position card is interactive.
    await page.goto("/portfolio");
    await expect(page.getByRole("heading", { name: "Portfolio" })).toBeVisible({
      timeout: 60_000,
    });

    const start = Date.now();
    await page.reload();
    await expect(page.getByRole("heading", { name: "Portfolio" })).toBeVisible();
    // DeployDemo seeds LP for exactly these two pairs.
    await expect(page.getByRole("heading", { name: "WETH / USDC" })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("heading", { name: "WETH / DAI" })).toBeVisible({
      timeout: 15_000,
    });
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(3000);

    // Spec: SC-004 via performance.getEntriesByType("navigation") timing.
    const nav = await page.evaluate(() => {
      const entry = performance.getEntriesByType(
        "navigation",
      )[0] as PerformanceNavigationTiming;
      return {
        dcl: entry.domContentLoadedEventEnd - entry.startTime,
        load: entry.loadEventEnd - entry.startTime,
      };
    });
    expect(nav.dcl).toBeGreaterThan(0);
    expect(nav.dcl).toBeLessThan(3000);
  });

  test("E2E-US4-02 Pool share + deposited amounts displayed", async ({ page }) => {
    await page.goto("/portfolio");
    await expect(page.getByRole("heading", { name: "WETH / USDC" })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("Pool share", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Deposited", { exact: true }).first()).toBeVisible();
    // Deposited rows render "{amount} {symbol}" (e.g. "100.0000 WETH").
    await expect(page.getByText(/\d+\.\d+\s+WETH/).first()).toBeVisible();
    await expect(page.getByText(/\d+\.\d+\s+USDC/).first()).toBeVisible();
  });

  test("E2E-US4-03 Transaction history rows with block explorer links", async ({
    page,
  }) => {
    await page.goto("/portfolio");
    await expect(
      page.getByRole("heading", { name: "Transaction History" }),
    ).toBeVisible({ timeout: 15_000 });

    // DeployDemo's mints leave Mint rows for the deployer. If the US1 swap
    // flow ran before this suite, Swap rows are present too — assert them when
    // available, and always require >= 1 history row with an explorer link.
    const swapRows = page.getByText("Swap", { exact: true });
    if ((await swapRows.count()) > 0) {
      await expect(swapRows.first()).toBeVisible();
    }

    const txLink = page
      .getByRole("link")
      .filter({ hasText: /0x[a-fA-F0-9]{4,}/ })
      .first();
    await expect(txLink).toBeVisible({ timeout: 15_000 });
    const href = await txLink.getAttribute("href");
    expect(href).toMatch(/\/tx\/0x[a-fA-F0-9]+/);
  });
});

test.describe("US4 Portfolio — account #2 (no LP)", () => {
  test("E2E-US4-04 Empty state for an account with no positions", async ({ page }) => {
    await injectWallet(page, {
      privateKey: ACCOUNT2_PK,
      address: ACCOUNT2_ADDR,
    });
    await page.goto("/portfolio");
    await expect(page.getByText(/No active positions/i)).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByRole("heading", { name: "WETH / USDC" })).toHaveCount(0);
    await expect(page.getByText("No transactions yet")).toBeVisible({
      timeout: 30_000,
    });
  });
});

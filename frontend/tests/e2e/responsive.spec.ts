// eslint-disable-next-line @typescript-eslint/ban-ts-comment -- E2E responsive suite is intentionally dynamically typed.
// @ts-nocheck
/**
 * T072b — Responsive viewport Playwright suite (FR-010 / SC-008).
 * Checklist: specs/001-uniswap-v2-resume/checklists/e2e-phase5.md (responsive rows).
 *
 * Exercises SwapWidget, AddLiquidity, RemoveLiquidity and PositionCard at four
 * viewports: 375×667 (iPhone SE), 414×896 (iPhone 11), 768×1024 (iPad portrait),
 * 1440×900 (desktop). Read-only suite (no wallet writes) — safe to run alongside
 * write suites; serial mode keeps execution deterministic.
 *
 * Seed anvil via DeployDemo + sync-deploy before running (T067 pattern):
 *   ../scripts/test-e2e.sh --unit-only   (or ../scripts/dev-deploy.sh)
 * then `npm run test:e2e` (playwright.config.ts webServer auto-starts `npm run dev`).
 *
 * NOTE — KNOWN GAPS against the current source (2026-08). These assertions are
 * the T072b acceptance criteria; several FAIL until the components are fixed
 * (do not weaken them to make the suite green — that defeats FR-010/SC-008):
 *   1. Navbar (src/components/wallet/Navbar.tsx) renders the full link row at
 *      every width — there is no mobile menu toggle below 768px yet, so the
 *      "collapses to mobile menu" assertion fails until the responsive nav lands.
 *   2. The connected navbar chrome (truncated address + chain + Disconnect) is
 *      wider than 375px, so `body.scrollWidth > window.innerWidth` on the two
 *      phone viewports — the no-horizontal-scroll assertions fail (mirrors the
 *      note in remove-liquidity.spec.ts E2E-US3-H-03).
 *   3. Touch targets: TokenSelect is `h-10` (40px) and action buttons are
 *      `py-2.5` + `text-sm` (40px) — under the 44px target. H-03 relaxed to
 *      `>= 40` ("near 44px touch target"); this suite asserts the full 44px.
 *      The amount inputs (py-2 + text-2xl ≈ 48px) already pass.
 */
import { test, expect } from "@playwright/test";
import { injectWallet } from "./fixtures/wallet";

test.describe.configure({ mode: "serial" });
test.setTimeout(60_000);

/** T072b viewport matrix. */
const VIEWPORTS = [
  { name: "iphone-se", width: 375, height: 667 },
  { name: "iphone-11", width: 414, height: 896 },
  { name: "ipad-portrait", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 900 },
] as const;

/** iOS HIG / WCAG 2.5.8 minimum touch-target size. */
const MIN_TOUCH_TARGET = 44;
/** Navbar collapses to a mobile menu below this breakpoint (FR-010). */
const MOBILE_BREAKPOINT = 768;

// ── Shared assertion helpers ────────────────────────────────────────────────

async function assertNoHorizontalScroll(
  page: import("@playwright/test").Page,
  label: string,
) {
  const fits = await page.evaluate(
    () => document.body.scrollWidth <= window.innerWidth,
  );
  expect(
    fits,
    `${label}: no horizontal scroll (body.scrollWidth <= window.innerWidth)`,
  ).toBe(true);
}

async function expectTouchTarget(
  locator: import("@playwright/test").Locator,
  label: string,
) {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  expect(box, `${label}: bounding box present`).not.toBeNull();
  expect(
    box!.height,
    `${label}: height >= ${MIN_TOUCH_TARGET}px touch target`,
  ).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
}

async function expectWithinViewport(
  locator: import("@playwright/test").Locator,
  label: string,
  viewportWidth: number,
) {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  expect(box, `${label}: bounding box present`).not.toBeNull();
  expect(box!.x, `${label}: left edge on-screen`).toBeGreaterThanOrEqual(-1);
  expect(
    box!.x + box!.width,
    `${label}: right edge within ${viewportWidth}px viewport`,
  ).toBeLessThanOrEqual(viewportWidth + 1);
}

/**
 * Point the swap widget at WETH → DAI. The destructive remove-liquidity suite
 * that sorts before this file closes WETH/USDC (E2E-US3-C-04) — WETH/DAI is
 * only partially burned, so it keeps reserves and always yields a live quote.
 */
async function swapToWethDai(page: import("@playwright/test").Page) {
  await page.locator("select").nth(1).selectOption("DAI");
}

// ── Suite ───────────────────────────────────────────────────────────────────

test.describe("Responsive viewports — FR-010 / SC-008 (T072b)", () => {
  test.describe.configure({ mode: "serial" });

  for (const vp of VIEWPORTS) {
    const isMobile = vp.width < MOBILE_BREAKPOINT;

    test.describe(`${vp.name} ${vp.width}x${vp.height}`, () => {
      test.use({ viewport: { width: vp.width, height: vp.height } });

      test.beforeEach(async ({ page }) => {
        // Deployer wallet: /swap + /liquidity forms fully interactive and
        // /portfolio shows the seeded positions (WETH/USDC + WETH/DAI).
        await injectWallet(page);
      });

      // ── /swap ────────────────────────────────────────────────────────────

      test(`${vp.name}: /swap — no horizontal scroll`, async ({ page }) => {
        await page.goto("/swap");
        await expect(page.getByRole("heading", { name: "Swap" })).toBeVisible({
          timeout: 15_000,
        });
        await assertNoHorizontalScroll(page, "/swap");
      });

      test(`${vp.name}: /swap — form inputs visible with >= ${MIN_TOUCH_TARGET}px touch targets`, async ({
        page,
      }) => {
        await page.goto("/swap");
        await expect(page.getByRole("heading", { name: "Swap" })).toBeVisible({
          timeout: 15_000,
        });

        const tokenInPicker = page.locator("select").first();
        const amountIn = page.locator('input[placeholder="0.0"]').first();
        const swapButton = page.locator("main button.w-full").last();

        await expectTouchTarget(tokenInPicker, "tokenIn picker");
        await expectTouchTarget(amountIn, "amountIn input");
        await expectTouchTarget(swapButton, "swap action button");
        await expectWithinViewport(swapButton, "swap action button", vp.width);
      });

      test(`${vp.name}: /swap — price impact stays visible after input`, async ({
        page,
      }) => {
        await page.goto("/swap");
        await expect(page.getByRole("heading", { name: "Swap" })).toBeVisible({
          timeout: 15_000,
        });

        await swapToWethDai(page);
        await page.locator('input[placeholder="0.0"]').first().fill("1");

        await expect(page.getByText("Price impact", { exact: true })).toBeVisible(
          { timeout: 15_000 },
        );
        await expect(page.getByText("Fee", { exact: true })).toBeVisible();
        await expect(page.getByText("Minimum received", { exact: true })).toBeVisible();
      });

      // ── /liquidity ───────────────────────────────────────────────────────

      test(`${vp.name}: /liquidity — add form reachable, no horizontal scroll`, async ({
        page,
      }) => {
        await page.goto("/liquidity");
        // exact: true — "Liquidity" is a substring of the "Add Liquidity" h2.
        await expect(
          page.getByRole("heading", { name: "Liquidity", exact: true }),
        ).toBeVisible({ timeout: 15_000 });
        await expect(
          page.getByRole("heading", { name: "Add Liquidity" }),
        ).toBeVisible();

        const inputs = page.locator('input[placeholder="0.0"]');
        const selects = page.locator("select");
        const action = page.locator("main button.w-full").last();

        await expect(inputs.nth(0)).toBeVisible();
        await expect(inputs.nth(1)).toBeVisible();
        await expect(selects.nth(0)).toBeVisible();
        await expect(selects.nth(1)).toBeVisible();
        await expect(action).toBeVisible();

        await expectTouchTarget(inputs.nth(0), "amountA input");
        await expectTouchTarget(inputs.nth(1), "amountB input");
        await expectTouchTarget(action, "add-liquidity action button");

        await assertNoHorizontalScroll(page, "/liquidity (add tab)");
      });

      test(`${vp.name}: /liquidity — tab switching Add <-> Remove`, async ({
        page,
      }) => {
        await page.goto("/liquidity");

        await page.getByRole("button", { name: "Remove", exact: true }).click();
        await expect(
          page.getByRole("heading", { name: "Remove Liquidity" }),
        ).toBeVisible({ timeout: 15_000 });

        await page.getByRole("button", { name: "Add", exact: true }).click();
        await expect(
          page.getByRole("heading", { name: "Add Liquidity" }),
        ).toBeVisible({ timeout: 15_000 });
      });

      // ── /portfolio ───────────────────────────────────────────────────────

      test(`${vp.name}: /portfolio — no horizontal scroll`, async ({ page }) => {
        await page.goto("/portfolio");
        await expect(
          page.getByRole("heading", { name: "Portfolio" }),
        ).toBeVisible({ timeout: 30_000 });
        await assertNoHorizontalScroll(page, "/portfolio");
      });

      test(`${vp.name}: /portfolio — position cards render without overflow`, async ({
        page,
      }) => {
        await page.goto("/portfolio");
        await expect(
          page.getByRole("heading", { name: "Portfolio" }),
        ).toBeVisible({ timeout: 30_000 });

        // DeployDemo seeds WETH/USDC + WETH/DAI LP to the deployer. The
        // remove-liquidity suite that sorts before this file closes WETH/USDC
        // (E2E-US3-C-04) and only partially burns WETH/DAI — accept either.
        const knownCards = ["WETH / USDC", "WETH / DAI"];
        const present: string[] = [];
        for (const label of knownCards) {
          if ((await page.getByRole("heading", { name: label }).count()) > 0) {
            present.push(label);
          }
        }
        expect(present.length, "at least one seeded position card renders").toBeGreaterThan(0);
        for (const label of present) {
          // The card div is the direct parent of the card heading (h3).
          await expectWithinViewport(
            page.getByRole("heading", { name: label }).locator(".."),
            `${label} card`,
            vp.width,
          );
        }
      });

      test(`${vp.name}: /portfolio — TWAP/spot price line stays visible`, async ({
        page,
      }) => {
        await page.goto("/portfolio");
        await expect(
          page.getByRole("heading", { name: "Portfolio" }),
        ).toBeVisible({ timeout: 30_000 });

        // useTwapPrice needs two samples >= 60s apart to report TWAP; a fresh
        // browser context always starts in spot-fallback, so accept either
        // source label — the FR-010 requirement is that the price line stays
        // visible and on-screen at every viewport.
        const cardCount = await page
          .getByRole("heading", { name: /WETH \/ (USDC|DAI)/ })
          .count();
        if (cardCount === 0) return; // empty state covered by portfolio.spec.ts

        await expect(
          page.getByText(/Price source: (TWAP|Spot)/).first(),
        ).toBeVisible({ timeout: 15_000 });
        await expect(page.getByText(/1 WETH ≈ [\d,]+/).first()).toBeVisible({
          timeout: 15_000,
        });
      });

      // ── Navbar collapse (FR-010) ─────────────────────────────────────────

      test(`${vp.name}: navbar — ${isMobile ? "collapses to a mobile menu toggle" : "full nav row visible"}`, async ({
        page,
      }) => {
        await page.goto("/swap");
        await expect(page.getByRole("heading", { name: "Swap" })).toBeVisible({
          timeout: 15_000,
        });

        if (isMobile) {
          // NOTE: Navbar.tsx has no toggle below 768px yet — this assertion is
          // the acceptance criterion for the responsive-nav work (see header).
          const toggle = page
            .getByRole("button", { name: /menu|hamburger/i })
            .or(page.locator('header button[aria-label*="menu" i]'))
            .or(page.locator('header button[aria-label*="hamburger" i]'));
          await expect(toggle.first()).toBeVisible({ timeout: 15_000 });
        } else {
          for (const label of ["Swap", "Liquidity", "Portfolio", "Debug"]) {
            // exact: true — "Liquidity" is a substring of the widget's
            // "Add Liquidity" CTA link, which can also be on the page.
            await expect(
              page.getByRole("link", { name: label, exact: true }),
            ).toBeVisible();
          }
        }
      });

      // ── 375px end-to-end usability ───────────────────────────────────────

      if (vp.width === 375) {
        test(`${vp.name}: /swap + /liquidity fully usable at 375px`, async ({
          page,
        }) => {
          // /swap: enter an amount → live quote, flip direction, open settings.
          await page.goto("/swap");
          const amountIn = page.locator('input[placeholder="0.0"]').first();
          await expect(amountIn).toBeVisible({ timeout: 15_000 });
          await swapToWethDai(page);
          await amountIn.fill("1");
          await expect(page.getByText("Price impact", { exact: true })).toBeVisible({
            timeout: 15_000,
          });

          await page.getByRole("button", { name: "Flip direction" }).click();
          await page.getByRole("button", { name: "Settings" }).click();
          await expect(page.getByText("Slippage tolerance")).toBeVisible();
          await page.getByRole("button", { name: "Settings" }).click();

          // /liquidity: fill both amounts → optimal-ratio hint, tab to Remove
          // and back.
          await page.goto("/liquidity");
          const inputs = page.locator('input[placeholder="0.0"]');
          await expect(inputs.nth(1)).toBeVisible({ timeout: 15_000 });
          await inputs.nth(0).fill("1");
          await expect(page.getByText("Optimal ratio", { exact: true })).toBeVisible(
            { timeout: 15_000 },
          );

          await page.getByRole("button", { name: "Remove", exact: true }).click();
          await expect(
            page.getByRole("heading", { name: "Remove Liquidity" }),
          ).toBeVisible({ timeout: 15_000 });
          await page.getByRole("button", { name: "Add", exact: true }).click();
          await expect(
            page.getByRole("heading", { name: "Add Liquidity" }),
          ).toBeVisible();
        });
      }
    });
  }
});

/**
 * k6 load test — SC-005 "100 concurrent users without performance degradation".
 * Task T074 — Portfolio read path (frontend read-only throughput, per plan.md).
 *
 * Goal: GET /api/reserves?pair=<known>&account=<test> sustains 100 VUs with
 *   p95 < 500ms, p99 < 1s, error rate < 1%, throughput >= 50 RPS over a 60s
 *   window (10s ramp-up -> 40s peak -> 10s ramp-down).
 *
 * Prerequisites (T067 pattern — anvil + DeployDemo seed + dev server):
 *   1. ../scripts/test-e2e.sh --unit-only   (fresh anvil + DeployDemo + sync; anvil stays up)
 *      or: ../scripts/dev-deploy.sh         (same, no tests)
 *   2. npm run dev                          (frontend on :3000, or a production build)
 *   3. PAIR: a deployed pair address — read from
 *      frontend/src/lib/contracts/addresses.ts after sync-deploy. The anvil
 *      deployment is ephemeral, so the address MUST be passed in; the default
 *      below deliberately 404s so a missed override fails the error-rate
 *      threshold instead of silently passing.
 *   4. ACCOUNT: any account with LP for a meaningful lpBalance read — the
 *      deployer default (holds the seeded WETH/USDC + WETH/DAI positions) works.
 *
 * Run (anvil, strict thresholds):
 *   k6 run -e PAIR=0x<deployed-pair> tests/load/swap-readonly.js
 *
 * Install k6: https://k6.io/docs/getting-started/installation/
 */
import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";

// Custom metrics scoped to the reserves endpoint.
const reservesTrend = new Trend("reserves_duration_ms", true);
const reservesErrors = new Rate("reserves_errors");

// --- configuration (env-overridable) -----------------------------------------
const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
// MUST be overridden with a deployed pair address (see header note).
const PAIR = __ENV.PAIR || "0x0000000000000000000000000000000000000000";
// Deployer account #0 — holds the DeployDemo-seeded LP.
const ACCOUNT = __ENV.ACCOUNT || "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
// Relaxed-threshold mode (optional, for lenient local runs).
const RELAXED = __ENV.RELAXED === "1";

export const options = {
  stages: [
    { duration: "10s", target: 100 }, // ramp-up
    { duration: "40s", target: 100 }, // peak
    { duration: "10s", target: 0 }, // ramp-down
  ],
  thresholds: {
    http_req_duration: RELAXED
      ? ["p(95)<2000", "p(99)<4000"]
      : ["p(95)<500", "p(99)<1000"],
    http_req_failed: ["rate<0.01"],
    http_reqs: RELAXED ? ["rate>=20"] : ["rate>=50"],
    reserves_duration_ms: RELAXED
      ? ["p(95)<2000", "p(99)<4000"]
      : ["p(95)<500", "p(99)<1000"],
    reserves_errors: ["rate<0.01"],
  },
};

export default function () {
  const url = `${BASE_URL}/api/reserves?pair=${PAIR}&account=${ACCOUNT}`;
  const res = http.get(url, { tags: { name: "reserves-read" } });

  const ok = check(res, {
    "status is 200": (r) => r.status === 200,
    "reserve0 in body": (r) => r.body.includes("reserve0"),
  });

  reservesTrend.add(res.timings.duration);
  reservesErrors.add(!ok);

  // 0.1–0.5s think time keeps the loop at a realistic read cadence.
  sleep(0.2);
}

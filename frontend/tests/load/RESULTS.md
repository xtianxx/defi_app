# Load test results — SC-005 (T074)

Load test for SC-005: "System handles 100 concurrent users without performance
degradation", interpreted per `specs/001-uniswap-v2-resume/plan.md` as frontend
**read-only** throughput on the Portfolio read path:
`GET /api/reserves?pair=<pair>&account=<account>`.

## Test setup

- **Target**: Next.js frontend dev server (`npm run dev`, `http://localhost:3000`).
- **Chain**: fresh anvil (chainId 31337, `http://127.0.0.1:8545`) seeded via
  DeployDemo (T067 pattern): `../scripts/test-e2e.sh --unit-only` or
  `../scripts/dev-deploy.sh` — both deploy Factory + Router + WETH9 + 4 mock
  tokens, seed the WETH/USDC + WETH/DAI pairs, and sync addresses into the
  frontend (`node scripts/sync-deploy.ts 31337`). Anvil stays running.
- **Endpoint**: `GET /api/reserves?pair=<deployed WETH/USDC pair>&account=<deployer>`.
- **Profile**: 100 virtual users · 60s total (10s ramp-up → 40s peak → 10s
  ramp-down) · ~0.2s think time per iteration (`tests/load/swap-readonly.js`).

## Thresholds

| Metric | Target |
|---|---|
| `http_req_duration` p95 | < 500 ms |
| `http_req_duration` p99 | < 1000 ms |
| error rate (`http_req_failed`) | < 1% |
| throughput (`http_reqs` rate) | ≥ 50 RPS |

## How to run

1. Install k6: <https://k6.io/docs/getting-started/installation/>
2. Seed anvil + deploy + sync (T067 pattern) and leave it running:
   `../scripts/test-e2e.sh --unit-only` (or `../scripts/dev-deploy.sh`).
3. Start the frontend dev server: `npm run dev` (in `frontend/`).
4. Read the deployed WETH/USDC pair address from
   `frontend/src/lib/contracts/addresses.ts` (rewritten by sync-deploy).
5. Run the test:

   ```bash
   k6 run -e PAIR=0x<deployed-pair> tests/load/swap-readonly.js
   ```

> **Status note**: k6 is **not installed** in the current dev environment, so
> the actual run is deferred — the script is ready to execute as soon as k6 is
> available. On threshold failure, add remediation tasks to
> `specs/001-uniswap-v2-resume/tasks.md` (e.g. cache tuning, RPC batching,
> route-handler profiling).

## Results

TODO: run k6 and fill in actual numbers.

| Metric | Target | Actual | Pass/Fail |
|---|---|---|---|
| `http_req_duration` p95 | < 500 ms | — | TODO |
| `http_req_duration` p99 | < 1000 ms | — | TODO |
| error rate (`http_req_failed`) | < 1% | — | TODO |
| throughput (`http_reqs` rate) | ≥ 50 RPS | — | TODO |
| `reserves_duration_ms` p95 | < 500 ms | — | TODO |
| `reserves_duration_ms` p99 | < 1000 ms | — | TODO |
| `reserves_errors` rate | < 1% | — | TODO |

### Run metadata (fill in after each run)

| Field | Value |
|---|---|
| Date | — |
| k6 version | — |
| Target | anvil (chainId 31337) |
| VUs / duration | 100 / 60s |
| `PAIR` used | — |
| `ACCOUNT` used | — |
| Command | — |

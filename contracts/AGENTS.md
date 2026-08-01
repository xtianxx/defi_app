# CONTRACTS — Foundry + Solidity

**Generated:** 2026-08-01

## OVERVIEW
Foundry package for the Uniswap V2 DEX: core (Factory/Pair/ERC20) and router (Router02/WETH9) are implemented per `specs/001-uniswap-v2-resume/`. Solc 0.8.19, via_ir, optimizer 200 runs.

## STRUCTURE
```
src/core/           UniswapV2Factory, UniswapV2Pair, UniswapV2ERC20
src/core/interfaces/  IUniswapV2*
src/core/libraries/   Math, SafeMath, UQ112x112
src/router/         UniswapV2Router02, WETH9
src/router/interfaces/ IERC20, IUniswapV2Router02, IWETH
src/router/libraries/  UniswapV2Library, TransferHelper
test/               core/ + router/ ({Contract}.t.sol), mocks/ (MockERC20, MaliciousERC20), utils/ (ErrorSelectors, TestHelpers)
script/             DeployDemo.s.sol (main demo — Factory+Router+WETH9+4 tokens, 2 seeded pairs), DeployDev.s.sol, core/DeployFactory.s.sol, router/DeployRouter.s.sol
lib/                forge-std + openzeppelin-contracts (gitignored)
```

## COMMANDS
- **Build**: `forge build` (via_ir; `--sizes` in CI) | **Test**: `forge test -vvv`; focused: `forge test --match-contract UniswapV2Pair -vvvv`
- **Format**: `forge fmt` (line_length 120, double quotes, no bracket spacing); CI enforces `forge fmt --check` first
- **Deploy demo**: `forge script script/DeployDemo.s.sol:DeployDemo --rpc-url <rpc> --broadcast --slow --private-key <key> -vvv`
- **Full local loop**: `../scripts/test-e2e.sh` (fresh anvil + deploy + sync + tests) or `../scripts/dev-deploy.sh` (leaves anvil running for the frontend)

## CONVENTIONS
- pragma ^0.8.19; forge-std Test/StdAssertions/StdCheats; `test_*()` unit, `testFuzz_*()` fuzz
- Deploy scripts `{Name}Script is Script` with `run()`
- CI order: fmt --check → build --sizes → test -vvv (root `.github/workflows/test.yml` — moved out of contracts/)

## GOTCHAS
- **lib/ is gitignored**; `.gitmodules` tracks forge-std ONLY — `openzeppelin-contracts` is already in `lib/` + `remappings.txt` but must be re-installed (`forge install openzeppelin-contracts`) after a fresh clone
- **Broadcast needs `--slow`** against anvil — without it, EIP-1559 fee-estimation timeouts can make the simulation succeed while the contracts never actually deploy
- **`broadcast/31337/` is gitignored** — re-run DeployDemo to refresh frontend bindings via sync-deploy
- No fork tests: `forge test` is self-contained (no anvil required)

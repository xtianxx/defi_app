# Tasks: Uniswap V2 Resume Project

**Input**: Design documents from `/specs/001-uniswap-v2-resume/`

**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅, quickstart.md ✅

**Tests**: INCLUDED — Constitution Principle III (TDD, ≥95% contract coverage) + spec SC-007 mandate test-first.

**Organization**: Tasks grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, FOUND)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization, tooling configuration, scaffold structure

- [X] T001 Reorganize `contracts/` per plan.md: create `src/core/{interfaces,libraries}`, `src/router/{interfaces,libraries}`, `script/{core,router}`, `test/{core,router,mocks,utils}` directories
- [X] T002 [P] Configure `contracts/foundry.toml`: solc_version = "0.8.19", via_ir = true, optimizer = true, optimizer_runs = 200 (research R0.2)
- [X] T003 [P] Install/verify Foundry libs in `contracts/lib`: `forge install foundry-rs/forge-std`; verify OpenZeppelin per AGENTS.md note
- [X] T004 [P] Replace `frontend/` Vite scaffold with Next.js 15 App Router: `package.json` (next@15, react@19, react-dom, ethers@6, tailwindcss, @radix-ui/*, lucide-react, @tanstack/react-query), `next.config.mjs`, `tsconfig.json` (strict: noUnusedLocals, noUnusedParameters, erasableSyntaxOnly, verbatimModuleSyntax), `tailwind.config.ts`, `postcss.config.mjs`, `components.json` (shadcn/ui)
- [X] T005 [P] Configure frontend test tooling: ESLint 10 flat config (js + tseslint + react-hooks + react-refresh), Vitest + @testing-library/react + @testing-library/jest-dom, Playwright; tsconfig strict flags from AGENTS.md
- [X] T006 [P] Scaffold `frontend/src/`: `app/{layout.tsx,page.tsx,swap/,liquidity/,portfolio/,api/reserves/}`, `src/{hooks,lib,components,providers,styles}/`, `styles/globals.css`
- [X] T007 [P] Create root `.github/workflows/test.yml` (move misplaced `contracts/.github/workflows/test.yml`): CI matrix — forge fmt --check → forge build --sizes → forge test -vvv → forge test --coverage; frontend lint → vitest → playwright e2e
- [X] T008 Apply constitution amendment Vite→Next.js in `.specify/memory/constitution.md`: bump version 1.0.0 → 1.1.0 (MINOR), update "Frontend Requirements" section to "React 19 with TypeScript; **Next.js 15 (App Router) for build tooling and routing**; ethers.js v6 for Web3 integration..." per plan.md amendment block

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

### Smart contract core (tests first — Constitution III TDD)

- [X] T009 [P] [FOUND] Write `contracts/test/core/UniswapV2ERC20.t.sol` — LP token tests: mint/burn/transfer/approve/transferFrom, EIP-2612 permit + domain separator, mint/burn restricted to pair owner
- [X] T010 [P] [FOUND] Write library tests in `contracts/test/core/`: `Math.t.sol` (min, Babylonian sqrt, edge cases zero/one/MAX_UINT256), `UQ112x112.t.sol` (encode/decode round-trip, overflow, underflow), `SafeMath.t.sol` (add/sub/mul unchecked blocks, overflow revert)
- [X] T011 [P] [FOUND] Write `contracts/test/core/UniswapV2Factory.t.sol` — Factory tests: createPair (sorted salt token0<token1, revert on duplicate), getPair returns correct address, allPairsLength increments, CREATE2 deterministic pair address across runs, feeTo/feeToSetter access control (revert on unauthorized setFeeTo/setFeeToSetter), pairCodeHash() pure + INIT_CODE_PAIR_HASH returns keccak256
- [X] T012 [FOUND] Write `contracts/test/core/UniswapV2Pair.t.sol` — Pair core tests: mint (proportional LP sqrt(amount0*amount1), MINIMUM_LIQUIDITY lock to address(0) on first mint, _update reserves+timestamp), burn (proportional token return, totalSupply decrease, _update), swap (exactly one amountOut>0 assert, post-swap K-invariant `balance0*balance1 >= reserve0*reserve1`, reentrancy lock flag, TWAP price0/1CumulativeLast update, _mintFee 0.3% 1/6 to feeTo when enabled), sync/skim (balance→reserve sync, excess transfer), fuzz tests for K-invariant, TWAP invariant over multiple swaps
- [X] T013 [P] [FOUND] Implement `contracts/src/core/libraries/Math.sol` (min, Babylonian sqrt with iterative approximation), `contracts/src/core/libraries/UQ112x112.sol` (uint224 encode/decode with Q112.112 fixed-point), `contracts/src/core/libraries/SafeMath.sol` (add/sub/mul in unchecked blocks, overflow revert)
- [X] T014 [P] [FOUND] Implement `contracts/src/core/UniswapV2ERC20.sol` — LP token: standard ERC-20 (name="Uniswap V2", symbol="UNI-V2", decimals=18), mint/burn restricted to factory-authorized pair, EIP-2612 permit (PERMIT_TYPEHASH, nonces, DOMAIN_SEPARATOR), _useNonce
- [X] T015 [P] [FOUND] Implement `contracts/src/core/interfaces/IUniswapV2Factory.sol` (createPair, getPair, allPairs+length, feeTo/feeToSetter/setFeeTo/setFeeToSetter, pairCodeHash, INIT_CODE_PAIR_HASH), `contracts/src/core/interfaces/IUniswapV2Pair.sol` (Mint/Burn/Swap/Sync events, token0/token1/factory, getReserves, price0/1CumulativeLast, kLast, mint/burn/swap/sync/skim signatures; swap drops `bytes data` flash param per FR-011), `contracts/src/core/interfaces/IUniswapV2ERC20.sol` (standard ERC-20 + permit)
- [X] T016 [FOUND] Implement `contracts/src/core/UniswapV2Factory.sol` — CREATE2 pair deployer with sorted-address salt `keccak256(abi.encodePacked(token0, token1))`, `allPairs` array + mapping, `feeTo`/`feeToSetter` governance with `onlyFeeToSetter` modifier, `pairCodeHash()` pure returns `keccak256(type(UniswapV2Pair).creationCode)` for dynamic init hash (R0.4), legacy `INIT_CODE_PAIR_HASH` constant
- [X] T017 [FOUND] Implement `contracts/src/core/UniswapV2Pair.sol` — AMM vault: uint112 `reserve0`/`reserve1`, `_update` (update reserves + cumulative TWAP prices + blockTimestampLast), `mint` (callable via lock flag, LP = sqrt(amount0*amount1) - MINIMUM_LIQUIDITY, lock MINIMUM_LIQUIDITY to address(0) on first mint), `burn` (proportional token return), `swap(amount0Out,amount1Out,to)` (reentrancy lock guard, K-invariant post-check, send tokens then _update; NO `bytes data` flash callback per FR-011), `_mintFee` (0.3% fee, 1/6 routed to feeTo when set), `sync`/`skim`, TWAP accumulators `price0CumulativeLast`/`price1CumulativeLast`
- [X] T018 [P] [FOUND] Implement `contracts/src/router/WETH9.sol` — canonical Wrapped ETH: `deposit()` payable, `withdraw(uint)`, standard ERC-20 (name="Wrapped Ether", symbol="WETH", decimals=18)
- [X] T019 [P] [FOUND] Implement `contracts/test/mocks/MockERC20.sol` — configurable ERC-20 fixture: constructor(name, symbol, decimals), mint(address,uint) public, for WETH=18/USDC=6/DAI=18/WBTC=8 test tokens
- [X] T020 [FOUND] Add `contracts/test/utils/TestHelpers.sol` (address sorting, event capture, balance snapshots) + `contracts/test/utils/ErrorSelectors.sol` (constant error selectors for UniswapV2: INSUFFICIENT_OUTPUT_AMOUNT, EXPIRED, INSUFFICIENT_LIQUIDITY, K, etc.)

### Frontend infrastructure (tests first where unit-testable)

- [X] T021 [P] [FOUND] Write `frontend/tests/unit/format.test.ts` (formatUnits by token decimals: WETH=18, USDC=6, DAI=18, WBTC=8, edge cases zero/MaxUint256) + `frontend/tests/unit/errors.test.ts` (decodeError maps: 4001→user-rejection, code 4902→wrong-network, custom revert INSUFFICIENT_OUTPUT_AMOUNT→slippage, EXPIRED→deadline, INSUFFICIENT_LIQUIDITY→pool-empty, gas estimation fail→gas-estimation, RPC timeout→rpc; verify hint strings present per R0.8)
- [X] T022 [P] [FOUND] Implement `frontend/src/lib/chains.ts` (anvil chainId=31337, sepolia chainId=11155111 hex=0xaa36a7, RPC URLs, block explorers), `frontend/src/lib/rpc.ts` (JsonRpcProvider factory for server-side reads, BrowserProvider helper for client), `frontend/src/lib/format.ts` (formatUnits/parseUnits by token decimals, percentage formatters), `frontend/src/lib/contracts/tokens.ts` (hardcoded WETH/USDC/DAI/WBTC with address(0) placeholders filled by sync-deploy, decimals per spec Token Configuration), `frontend/src/lib/errors.ts` (ErrorCode discriminated union, ErrorEntry with code+message+hint, decodeError(err,ctx?) per R0.8)
- [X] T023 [P] [FOUND] Implement `frontend/src/lib/contracts/abis.ts` (import + re-export ABIs from `contracts/out/` — UniswapV2Factory, UniswapV2Pair, UniswapV2Router02, ERC20, WETH9; generated by sync-deploy), `frontend/src/lib/contracts/addresses.ts` (DEPLOYMENTS Record<chainId, {factory,router,weth,tokens}>, typed with `0x${string}`, anvil + sepolia entries)
- [X] T024 [P] [FOUND] Implement `frontend/scripts/sync-deploy.ts` — read `contracts/broadcast/<chainId>/run-latest.json`, extract deployed addresses, read ABIs from `contracts/out/<Contract>.sol/<Contract>.json`, regenerate `src/lib/contracts/addresses.ts` (per-chain DEPLOYMENTS) + refresh `src/lib/contracts/abis.ts` (anti-drift per R0.9)
- [X] T025 [P] [FOUND] Implement `frontend/src/providers/Web3Provider.tsx` ('use client' React Context: status/account/chainId/provider/signer/error/connect/switchChain/disconnect) + `frontend/src/hooks/useWeb3.ts` (singleton hook consuming Web3Provider: BrowserProvider wrapping window.ethereum, ASYNC getSigner v6, connect via eth_requestAccounts, switchChain via wallet_switchEthereumChain with 4902 fallback to wallet_addEthereumChain, accountsChanged→reconnect or reset on [], chainChanged→window.location.reload, disconnect) per R0.6
- [X] T026 [P] [FOUND] Write `frontend/tests/unit/useWeb3.test.ts` + `frontend/tests/unit/Web3Provider.test.tsx` — Testing Library + vi.stubGlobal fake EIP-1193 provider: test connect flow (eth_requestAccounts→getSigner→state), accountsChanged reset to idle on empty array, chainChanged reload, switchChain Sepolia, wrong-network banner, wallet-missing error
- [X] T027 [P] [FOUND] Implement `frontend/src/app/layout.tsx` (root layout with Web3Provider wrapper + Navbar + metadata title="Uniswap V2 Resume") + `frontend/src/app/page.tsx` ('use client', redirect to /swap) + `frontend/src/components/wallet/ConnectButton.tsx` ('use client', MetaMask connect/disconnect, chain switch banner on wrong network with switch action, truncated address display)
- [X] T028 [P] [FOUND] Implement `frontend/src/hooks/useToken.ts` ('use client': read symbol/name/decimals via ERC20.balanceOf/allowance/approve with active signer) + `frontend/tests/unit/useToken.test.ts` (mock contract calls, approve flow, balance refresh, decimals caching)
- [X] T029 [P] [FOUND] Implement `frontend/src/hooks/usePair.ts` ('use client': compute pairAddress via UniswapV2Library.pairFor using factory+tokenA+tokenB+pairCodeHash, call getReserves/price0CumulativeLast/price1CumulativeLast/totalSupply/balanceOf(user), client-side getAmountOut/getAmountIn mirroring UniswapV2Library 0.3% fee math) + `frontend/tests/unit/usePair.test.ts` (validate getAmountOut against known on-chain values, pair creation detection, reserves parsing uint112)
- [X] T030 [P] [FOUND] Implement `frontend/src/hooks/useTwapPrice.ts` (pure computeTwap fn: `(cumulativeB - cumulativeA) << 112 / (timestampB - timestampA)` with division-by-zero guard, 2-sample rolling localStorage cache per pool, spot-price fallback from reserves labeled "spot (no archive)" when windowSeconds < minimum) + `frontend/tests/unit/useTwapPrice.test.ts` (computeTwap math per data-model E8, cache TTL, spot fallback path)
- [X] T031 [FOUND] Implement `contracts/script/core/DeployFactory.s.sol` (Forge script: constructor feeToSetter arg from env, broadcast, console.log factory address) + `contracts/script/router/DeployRouter.s.sol` (Forge script: constructor factory+weth args, broadcast, console.log router address) — consumed by sync-deploy.ts

**Checkpoint**: Foundation ready — core smart contracts (Factory, Pair, ERC20, WETH9, libraries, interfaces) + frontend infra (Web3Provider, useWeb3, useToken, usePair, useTwapPrice, lib config, sync-deploy). User story implementation can now begin.

---

## Phase 3: User Story 1 — Token Swap Execution (Priority: P1) 🎯 MVP

**Goal**: As a potential employer reviewing this resume project, I want to swap tokens on a decentralized exchange interface so that I can verify the implementation correctly handles token exchanges and follows standard DeFi mechanics.

**Independent Test**: Connect wallet → /swap → pick WETH→USDC → enter swap amount → see estimated output + price impact + 0.30% fee → approve → swap → receipt.status===1, token balances update correctly.

### Tests for User Story 1 (write FIRST, ensure they FAIL)

- [X] T032 [P] [US1] Write `contracts/test/router/UniswapV2Library.t.sol` — Library unit tests: `sortTokens` (returns [lower,higher] by address), `pairFor` using dynamic `factory.pairCodeHash()` CREATE2 address calculation validated against factory.createPair output, `getReserves` (decodes uint112 pair from getReserves, sorts by token order), `getAmountOut`/`getAmountIn` (0.3% fee, 997/1000 numerator/denominator rounding, edge cases zero reserve, amountOut==reserveOut revert insufficient liquidity)
- [X] T033 [P] [US1] Write `contracts/test/router/TransferHelper.t.sol` — safeTransfer/safeTransferFrom/safeTransferETH: successful transfer, revert on insufficient balance/allowance, revert selector matching TRANSFER_FROM_FAILED
- [X] T034 [P] [US1] Write `contracts/test/router/UniswapV2Router02.t.sol` swap cases: `swapExactTokensForTokens` (direct pair path.length==2, verifies output >= amountOutMin, checks balances), `swapTokensForExactTokens`, ETH variants (swapExactETHForTokens/decode, swapTokensForExactETH, swapExactTokensForETH, swapETHForExactTokens), path.length==2 assert reverts with DIRECT_PAIR_ONLY on multi-hop attempt, deadline EXPIRED revert, slippage `UniswapV2: INSUFFICIENT_OUTPUT_AMOUNT` revert, WETH deposit/withdraw wrap/unwrap, zero-amount input revert
- [X] T035 [P] [US1] Write `frontend/tests/unit/useSwap.test.ts` — phase state machine: idle→approving (token.approve called)→submitting (router.swapExactTokensForTokens called)→mining (tx.wait pending)→confirmed (receipt.status===1)→reverted (receipt.status===0); user rejection code 4001→rejected phase (no scary toast); contract revert selector decode→error phase with correct ErrorCode; setParams updates amountOutEstimated; gas estimation failure→gas-estimation error
- [X] T036 [P] [US1] Write `frontend/tests/unit/SwapWidget.test.tsx` — Testing Library: tokenIn/tokenOut pickers limited to 4 demo tokens (WETH/USDC/DAI/WBTC), amountIn input parsing with correct decimals, estimated output display via getAmountOut, price impact % and 0.30% fee display, approve button when allowance < amountIn, swap button enabled states, pool-empty error + "Add Liquidity" CTA when pair doesn't exist, error toast for each ErrorCode

### Implementation for User Story 1

- [X] T037 [P] [US1] Implement `contracts/src/router/interfaces/IUniswapV2Router02.sol` (addLiquidity/addLiquidityETH, removeLiquidity/removeLiquidityETH + permit variants, swapExactTokensForTokens/swapTokensForExactTokens + ETH variants — all with `address[] calldata path`), `contracts/src/router/interfaces/IERC20.sol` (standard ERC-20), `contracts/src/router/interfaces/IWETH.sol` (deposit, withdraw)
- [X] T038 [P] [US1] Implement `contracts/src/router/libraries/UniswapV2Library.sol` — `sortTokens` (returns token0<token1 ordered pair), `pairFor` (view, calls `factory.pairCodeHash()` for dynamic init hash per R0.4 then computes CREATE2 address), `getReserves` (view, fetches + sorts reserves to match token order), `getAmountOut(amountIn,reserveIn,reserveOut)` (0.3% fee: amountIn*997*reserveOut/(reserveIn*1000+amountIn*997), rounding), `getAmountIn(amountOut,reserveOut,reserveIn)` (reverse formula); NO `getAmountsOut`/`getAmountsIn` multi-hop helpers per R0.3
- [X] T039 [P] [US1] Implement `contracts/src/router/libraries/TransferHelper.sol` — `safeTransfer(token,to,value)`, `safeTransferFrom(token,from,to,value)`, `safeTransferETH(to,value)` with low-level call revert on failure, custom error `TransferFailed` with reason decoding
- [X] T040 [US1] Implement `contracts/src/router/UniswapV2Router02.sol` — full contract body with: constructor(factory,weth) immutable, `_addLiquidity` stub, `addLiquidity`/`addLiquidityETH` stubs, `removeLiquidity`/`removeLiquidityETH` + permit variant stubs, **swap functions** (swapExactTokensForTokens: assert path.length==2→revert DIRECT_PAIR_ONLY, library.getAmountOut(amountIn,reserveIn,reserveOut) once (path.length==2) — see T038 (no multi-hop helpers), transferFrom tokenIn, _swap path loop, verify amounts[last]>=amountOutMin; swapTokensForExactTokens: reverse; ETH variants wrap/unwrap via WETH9), `_swap` internal (pair.swap, verify amounts returned), deadline check (require deadline>=block.timestamp, revert EXPIRED), modifier `ensure(deadline)`
- [X] T041 [US1] Implement `frontend/src/hooks/useSwap.ts` — 'use client' hook: `setParams(tokenIn,tokenOut,amountIn)` computes amountOutEstimated via usePair.getAmountOut + priceImpactPctBp + feePctBp=30; `execute(amountOutMin,deadlineSeconds)` flow: check allowance → if low, call token.approve(router,amountIn) with approving phase → submit router.swapExactTokensForTokens(amountIn,amountOutMin,[tokenIn,tokenOut],account,deadline) with submitting phase → tx.wait() mining phase → receipt.status===1 confirmed phase : reverted phase; catch: err.code===4001→rejected, contract revert selector decode via abis.ts→errors.ts, gas estimation→gas-estimation; `reset()` clears state; phase enum matching frontend-module-api
- [X] T042 [US1] Implement `frontend/src/components/swap/SwapWidget.tsx` — 'use client' component: tokenIn/tokenOut pickers (dropdown limited to 4 demo tokens WETH/USDC/DAI/WBTC from tokens.ts), amountIn input field with token-specific decimal parsing, estimated output display (readonly, formatted), price impact display (colored: green<1%, yellow<5%, red>=5%), 0.30% fee display, approve button (when allowance < amountIn, calls useToken.approve), swap button (disabled conditions: not connected, wrong network, empty amount, insufficient balance, pool empty), pool-empty banner (pair doesn't exist: show error + "Add Liquidity" link CTA), error toast via lib/errors.ts for all phases, txHash link to block explorer on confirmed; FR-005 estimated output+fees, FR-008 graceful errors, FR-011 direct-pair-only enforced via picker
- [X] T043 [US1] Implement `frontend/src/app/swap/page.tsx` — 'use client' page: mounts Web3Provider context, ConnectButton in header, SwapWidget as main content, responsive layout (desktop centered card, mobile full-width)
- [X] T044 [US1] Implement `contracts/script/DeployDemo.s.sol` — full anvil demo deployer: `vm.startBroadcast(deployerPrivateKey)`, deploy **MockERC20 ×3** (new MockERC20("USD Coin","USDC",6), new MockERC20("Dai Stablecoin","DAI",18), new MockERC20("Wrapped BTC","WBTC",8)) — **WETH is the real `WETH9` contract, NOT a MockERC20**, to keep pair address consistent between `createPair` and `addLiquidityETH` (per C1 fix: pair address = `keccak256(abi.encodePacked(token0,token1))` salt of canonical WETH9), deploy WETH9 (named "Wrapped Ether","WETH",18), deploy UniswapV2Factory(deployer) → `factory.createPair(address(weth9),USDC)` + `factory.createPair(address(weth9),DAI)`, deploy UniswapV2Router02(factory,address(weth9)), fund deployer with minted tokens, `router.addLiquidityETH{value:10e18}(USDC,10000e6,9500e6,9e18,deployer,deadline)` + same for DAI pair (seed 10000e18 DAI + 10e18 ETH), console.log all deployed addresses incl. `address(weth9)`, `vm.stopBroadcast()`; **pair enumeration (C2/C3 fix)**: KNOWN_PAIRS = [WETH/USDC, WETH/DAI, WETH/WBTC, USDC/DAI, USDC/WBTC, DAI/WBTC] (C(4,2)=6) — T044 seeds the first 2; the remaining 4 are created by users via Add Liquidity first-provider flow (US2-4); `frontend/src/lib/contracts/tokens.ts` exports this list as `KNOWN_PAIRS: AddressPair[]` typed
- [X] T045 [US1] Run quickstart.md Scenario A validation: start anvil → forge script DeployDemo --broadcast → node scripts/sync-deploy.ts → npm run dev → browser: connect MetaMask→/swap→pick WETH→USDC, enter 1 WETH → verify estimated output/fee/impact → approve → swap → receipt.status===1 → balances update (SC-001 < 2min); also: try USDC→DAI (no pool initially) → verify pool-empty error + "Add Liquidity" CTA

**Checkpoint**: US1 fully functional — wallet connect, token swap with approval flow, estimated output preview + fees + price impact, graceful error surfacing, demo deploy script. MVP ready for demo.

---

## Phase 4: User Story 2 — Liquidity Provision (Priority: P2)

**Goal**: As a reviewer, I want to add liquidity to token pairs so that I can evaluate the implementation of liquidity pool mechanics and liquidity token accounting.

**Independent Test**: /liquidity → pick USDC/DAI pair → enter deposit amounts → confirm → LP tokens minted correctly; initial liquidity on new pool works; asymmetric deposit shows optimal ratio guidance.

### Tests for User Story 2 (write FIRST, ensure they FAIL)

- [X] T046 [P] [US2] Write addLiquidity tests in `contracts/test/router/UniswapV2Router02.t.sol` — `addLiquidity`: proportional LP mint (shares = sqrt(amountADesired*amountBDesired), assets pulled via transferFrom), slippage protection (revert when amountAMin>actualA with INSUFFICIENT_A_AMOUNT, same for B), initial liquidity (first provider: LP = sqrt(amountA*amountB)-MINIMUM_LIQUIDITY, MINIMUM_LIQUIDITY locked to address(0) per SC-US2-4), asymmetric deposit adjustment (desiredA>desiredB ratio, system auto-adjusts to pool ratio per US2-3, verifies actualA<=desiredA,actualB<=desiredB); `addLiquidityETH`: ETH wrap to WETH, msg.value matched, same LP math
- [X] T047 [P] [US2] Write `frontend/tests/unit/useLiquidity.add.test.ts` (addLiquidity/addLiquidityETH phase machine: approving tokenA/B → submitting → confirmed; ETH variant ensures msg.value forwarded; failed approval→error) + `frontend/tests/unit/AddLiquidity.test.tsx` (initial liquidity flow per US2-4: create new pair, enter amounts, confirm; asymmetric guidance per US2-3: enter tokenA>tokenB with pool ratio ≠ 1:1, verify warning message + optimal B shown; active positions list shows LP balance after add)

### Implementation for User Story 2

- [X] T048 [US2] Implement addLiquidity + addLiquidityETH in `contracts/src/router/UniswapV2Router02.sol` — `_addLiquidity`: sort tokens, factory.createPair if pair doesn't exist, compute optimal amounts via library getReserves (if pool exists: amountBOptimal = quote(amountADesired,reserveA,reserveB), clamp; else: first liquidity, use desired amounts), pull tokens via TransferHelper.safeTransferFrom, pair.mint(to), verify amounts meet minimums (require(amountAMin<=amountA&&amountBMin<=amountB, INSUFFICIENT_A_AMOUNT/INSUFFICIENT_B_AMOUNT)); `addLiquidity`: calls _addLiquidity; `addLiquidityETH`: wraps ETH→WETH, calls _addLiquidity with WETH as token, refunds unused ETH — extends T040
- [X] T049 [US2] Implement addLiquidity + addLiquidityETH methods in `frontend/src/hooks/useLiquidity.ts` — 'use client' hook: `addLiquidity({tokenA,tokenB,amountADesired,amountBDesired,amountAMin,amountBMin,deadlineSeconds})` → tokenA.approve(router,amountADesired) then tokenB.approve → router.addLiquidity(...)→tx.wait; `addLiquidityETH({token,amountTokenDesired,amountTokenMin,amountETHMin,deadlineSeconds,msgValue})` → token.approve then router.addLiquidityETH{value:msgValue}(...)→tx.wait; same phase state machine (approving/submitting/mining/confirmed/reverted/rejected/error) as useSwap; `estimateOptimal(tokenADesired,tokenA,tokenB,reserveA,reserveB)` pure fn for asymmetric guidance
- [X] T050 [US2] Implement `frontend/src/components/liquidity/AddLiquidity.tsx` — 'use client' component: tokenA/tokenB pickers (from 4 demo tokens), amountA/amountB inputs, optimal ratio guidance (when pool exists: compute optimalB = amountA * reserveB / reserveA, show warning if deviation > 1%, highlight optimal value per US2-3), initial liquidity mode (when pool doesn't exist: show "First liquidity provider — sets initial price ratio" per US2-4, both amounts required), slippage tolerance setting (min amounts), confirm button with approval+add flow, tx phase feedback; default slippage 0.5%, editable
- [X] T051 [US2] Implement `frontend/src/app/liquidity/page.tsx` — 'use client' page: Add Liquidity tab (active by default) + Remove Liquidity tab (placeholder, implemented in US3), active positions list below tabs (fetches via usePair for each demo pair: lpBalance>0 → show pair name + lpBalance + pool share %), responsive layout

**Checkpoint**: US1 + US2 independently functional — users can swap AND provide liquidity.

---

## Phase 5: User Story 3 — Liquidity Removal (Priority: P3)

**Goal**: As a reviewer, I want to remove liquidity from positions so that I can verify the implementation correctly handles liquidity token burning and asset recovery.

**Independent Test**: /liquidity → Remove tab → pick position → set removal % → see estimated token returns → confirm → LP burned, proportional tokens returned; 100% removal closes position.

### Tests for User Story 3 (write FIRST, ensure they FAIL)

- [ ] T052 [P] [US3] Write removeLiquidity tests in `contracts/test/router/UniswapV2Router02.t.sol` — `removeLiquidity`: LP transfer to pair, pair.burn returns (amountA,amountB), verify proportional return (amountA = liquidity*totalReserveA/totalSupply, same for B), slippage protection (revert when amountA<amountAMin or amountB<amountBMin), 100% removal closes position (US3-3: lpBalance→0, totalSupply decreases), `removeLiquidityETH`: unwrap WETH→ETH; permit variants: EIP-2612 signed permit before removal; deadline EXPIRED
- [ ] T053 [P] [US3] Write `frontend/tests/unit/useLiquidity.remove.test.ts` (removeLiquidity/removeLiquidityETH permit+non-permit flows, 100% close, phase machine matching useSwap) + `frontend/tests/unit/RemoveLiquidity.test.tsx` (percentage slider 25/50/75/100, estimated token returns preview for each %, 100% close confirmation extra warning, permit-sign flow when applicable)

### Implementation for User Story 3

- [ ] T054 [US3] Implement removeLiquidity + removeLiquidityETH + permit variants in `contracts/src/router/UniswapV2Router02.sol` — `removeLiquidity`: pull LP via TransferHelper.safeTransferFrom(user,pair,liquidity), pair.burn(to) returns (amountA,amountB), require amountA>=amountAMin&&amountB>=amountBMin; `removeLiquidityETH`: unwrap WETH→ETH via IWETH.withdraw then safeTransferETH; `removeLiquidityWithPermit`/`removeLiquidityETHWithPermit`: accept v,r,s + deadline, call pair.permit before transfer — extends T040/T048
- [ ] T055 [US3] Extend `frontend/src/hooks/useLiquidity.ts` with removeLiquidity/removeLiquidityETH + permit variants — same phase state machine, `estimateRemoval(liquidity,pair,totalSupply,reserve0,reserve1)` compute expected returns; add to imported hook — extends T049
- [ ] T056 [US3] Implement `frontend/src/components/liquidity/RemoveLiquidity.tsx` — 'use client' component: position picker (show active positions from usePair, display lpBalance + pool share %), percentage slider (25%/50%/75%/100% preset buttons + custom %), estimated token returns preview (realtime: amountA = lpToBurn * reserveA / totalSupply, same for B; formatted by token decimals per US3-1), 100% removal extra confirmation dialog ("This closes your position entirely" per US3-3), slippage tolerance, confirm with removeLiquidity flow, tx phase feedback
- [ ] T057 [US3] Complete `frontend/src/app/liquidity/page.tsx` — Add Remove Liquidity tab (alongside Add), tab switching with active positions shared between tabs; responsive layout — extends T051

**Checkpoint**: US1 + US2 + US3 independently functional — full swap + add/remove liquidity lifecycle.

---

## Phase 6: User Story 4 — Portfolio & Analytics View (Priority: P4)

**Goal**: As a reviewer, I want to view my liquidity positions and portfolio summary so that I can assess the implementation's ability to aggregate and display DeFi portfolio data.

**Independent Test**: After performing swap + liquidity ops → /portfolio → see all active positions with share %, deposited amounts, fees-earned estimate; swap/mint/burn history with timestamps and block-explorer links; portfolio loads in < 3s (SC-004).

### Tests for User Story 4 (write FIRST, ensure they FAIL)

- [ ] T058 [P] [US4] Write `frontend/tests/unit/useTwapPrice.integration.test.ts` — computeTwap: 2 samples 30min apart, verify `(cumB-cumA) << 112 / (tsB-tsA)` matches expected; division-by-zero guard when windowSeconds<1; spot-fallback when only one sample available, labeled "spot (no archive)"; localStorage cache: store+retrieve 2-sample rolling cache per pool, TTL expiry
- [ ] T059 [P] [US4] Write `frontend/tests/unit/PositionCard.test.tsx` (sharePctBp = lpBalance * 10000 / totalSupply, depositedAmount0/1 = reserve0/1 * lpBalance / totalSupply, feesEarned estimate, pool symbols display) + `frontend/tests/unit/reservesRoute.test.ts` (GET /api/reserves?pair=&account= returns reserves/totalSupply/lpBalance, 200 OK, caching header, error on missing params, handles pair-not-found gracefully)
- [ ] T060 [P] [US4] Write `frontend/tests/e2e/portfolio.spec.ts` — Playwright against anvil with DeployDemo seed: visit /portfolio, assert page load < 3s (SC-004 via performance.getEntriesByType navigation timing), assert 2 positions visible (WETH/USDC + WETH/DAI), assert share % + deposited amounts displayed, assert transaction history includes swap from US1 flow, click txHash → opens block explorer; also test empty state when wallet has no positions

### Implementation for User Story 4

- [ ] T061 [P] [US4] Implement `frontend/src/app/api/reserves/route.ts` — Next.js App Router Route Handler: GET with `pair` + `account` query params, create JsonRpcProvider(rpcUrl), batch-call pair.getReserves() + pair.price0CumulativeLast() + pair.price1CumulativeLast() + pair.totalSupply() + pair.balanceOf(account), return JSON `{reserve0,reserve1,blockTimestampLast,price0CumulativeLast,price1CumulativeLast,totalSupply,lpBalance}`, wrap with `next/unstable_cache` (tags: ['reserves', pair], revalidate: 2) for SC-004 < 3s caching, runtime='nodejs', error handling: pair-not-found→404, RPC error→502 with retry-after header
- [ ] T062 [US4] Implement `frontend/src/components/portfolio/PositionCard.tsx` — 'use client' component: receives pairAddress+token0+token1+reserves+totalSupply+lpBalance, computes sharePctBp = (lpBalance * 10000n / totalSupply), depositedAmount0 = reserve0 * lpBalance / totalSupply, depositedAmount1 = reserve1 * lpBalance / totalSupply, feesEarned estimate (current claimable - mint-event deposit tracked client-side, or simplified: `currentValue - depositedAmount` using TWAP), displays formatted amounts with token symbols, pool share progress bar; links to /liquidity?pair= for add/remove; skeleton loading state
- [ ] T063 [US4] Implement `frontend/src/app/portfolio/page.tsx` — 'use client' page: fetch positions for all KNOWN_PAIRS (WETH/USDC, WETH/DAI, WETH/WBTC, USDC/DAI, USDC/WBTC, DAI/WBTC — 6 pairs; see T044) via /api/reserves (batched Promise.all for the 4 unseeded pairs that may not exist yet — handle 404 gracefully, only render non-empty positions), filter lpBalance>0→render PositionCard, TWAP price from useTwapPrice for USD-equivalent values, empty state ("No active positions — try swapping or adding liquidity"), transaction history section (swap/mint/burn events from usePair event logs filtered by to===account, sorted by blockTimestamp desc, each row: type icon+pair+amounts+timestamp+block explorer tx link), skeleton loaders during fetch, SC-004: ensure page interactive < 3s
- [ ] T064 [US4] Implement portfolio event aggregation in `frontend/src/hooks/usePortfolio.ts` (or extend usePair) — 'use client' hook: for each known pair+user, query Swap/Mint/Burn events via ethers contract.queryFilter with fromBlock filter, aggregate into HistoryEntry[] (type: 'swap'|'mint'|'burn', pair, token0/token1 amounts, timestamp, txHash), paginate client-side; for swap history, derive direction (in/out) by comparing tokens to user balance changes (US4-3 analytics); optional lightweight index using @tanstack/react-query for cache+retry

**Checkpoint**: All four user stories independently functional — swap, add/remove liquidity, portfolio with positions + history + TWAP prices.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Quality gates, documentation, deployment validation, and improvements affecting multiple stories

- [ ] T065 [P] Run contracts CI pipeline: `forge fmt --check` (Constitution IV formatting), `forge build --sizes` (assert Router02 < 24KB after optimizer, Constitution IV), `forge test -vvv` (all tests green), `forge test --coverage` (assert lines ≥ 95% per Constitution III), `forge snapshot` (commit gas baseline .gas-snapshot for swap/mint/burn/createPair — CI diffs this)
- [ ] T066 [P] Run frontend CI pipeline: `npm run lint` (ESLint zero errors), `tsc --noEmit` (strict mode zero errors), `npm run test` (Vitest all green, coverage reports for hooks/lib), `npm run build` (Next.js build succeeds, no warnings)
- [ ] T067 [P] Run Playwright E2E full suite against anvil: SC-001 swap end-to-end (< 2min), SC-004 portfolio < 3s, pool-empty edge case (error + CTA), wrong-network handler (switch banner), user-rejection (4001 no scary toast), deadline expiry, slippage exceed, gas-estimation failure; auto-seed via DeployDemo before suite
- [ ] T068 [P] Audit `frontend/src/lib/errors.ts` against `contracts/smart-contract-interfaces.md` error-selector table: every selector (INSUFFICIENT_OUTPUT_AMOUNT, EXPIRED, INSUFFICIENT_LIQUIDITY, INSUFFICIENT_A_AMOUNT, INSUFFICIENT_B_AMOUNT, DIRECT_PAIR_ONLY, TRANSFER_FROM_FAILED, INSUFFICIENT_INPUT_AMOUNT, K invariant) mapped to correct ErrorCode + human message + hint per R0.8; verify single error-UX source (FR-008)
- [ ] T069 [P] Add NatSpec to all public/external functions in `contracts/src/` — /// @notice + @param + @return + @dev (Constitution IV); verify `forge fmt` compliance after NatSpec additions
- [ ] T070 [P] Write root `README.md` — project overview, architecture diagram (monorepo: contracts (Foundry) + frontend (Next.js)), setup instructions (prerequisites: Foundry + Node.js 20+ + MetaMask), quickstart link, local anvil dev loop (A.1–A.6 from quickstart.md), Sepolia demo steps, contract addresses, testing commands, CI badge, license (Constitution V)
- [ ] T071 [P] Run slither static analysis on `contracts/` — `slither .` (Constitution Tech Standard: "no high/critical findings"); document any informational findings in `contracts/SLITHER.md`; if false positives, add slither.config.json exclusions with justification
- [ ] T071b [P] Run mythril analysis on `contracts/` per Constitution Tech Standard L104 ("Slither/Mythril analysis with no high/critical findings"). Install via `pipx install mythril`; analyze each core contract (`myth analyze contracts/src/core/UniswapV2Factory.sol`, `UniswapV2Pair.sol`, `UniswapV2Router02.sol`). Document findings in `contracts/MYTHRIL.md`; **gate**: zero high/critical Mythril findings required before T073. If Mythril is not installable in this environment, record a justified exclusion in `contracts/MYTHRIL.md` and propose a follow-up Constitution amendment to drop Mythril (current Slither + ≥95% fuzz coverage is functionally equivalent at this scope).
- [ ] T072 [P] Run quickstart.md Scenario B end-to-end (Sepolia): deploy Factory+Router02+WETH9 via Forge scripts → verify on Etherscan → node scripts/sync-deploy.ts → `npm run build && npm run preview` (or deploy to Vercel) → manual browser: connect MetaMask Sepolia, swap WETH→USDC from seeded pair, add/remove liquidity, view portfolio — public demo validation
- [ ] T072b [P] Add Playwright responsive viewport suite `frontend/tests/e2e/responsive.spec.ts` — test SwapWidget, AddLiquidity, RemoveLiquidity, PositionCard at viewports: 375×667 (iPhone SE), 414×896 (iPhone 11), 768×1024 (iPad portrait), 1440×900 (desktop). Assertions: no horizontal scroll on any page, navbar collapses to mobile menu below 768px, all form inputs reachable with ≥44px touch target, price impact + TWAP price remain visible, `/swap` and `/liquidity` are fully usable at 375px. Validates FR-010 (responsive) and SC-008 (mobile devices). Seed anvil via DeployDemo before suite (T067 pattern).
- [ ] T073 Verify `.gitignore` completeness: `contracts/{broadcast/,out/,lib/,cache/}` + `frontend/{.next/,node_modules/,out/}` + `.codegraph/` + `.DS_Store`; confirm `.github/workflows/test.yml` triggers on push + PR to main/feature branches
- [ ] T074 [P] Add k6 load test for SC-005 "100 concurrent users without performance degradation" (interpreted per plan.md as frontend read-only throughput): `frontend/tests/load/swap-readonly.js` — 100 virtual users, 60s duration, 10s ramp-up → 40s peak → 10s ramp-down, hit `GET /api/reserves?pair=<known>&account=<test>` (Portfolio read path). Thresholds: p95 < 500ms, p99 < 1s, error rate < 1%, throughput ≥ 50 RPS sustained. Run against anvil (T067 pattern) + optionally against Sepolia public RPC with relaxed thresholds. Document results in `frontend/tests/load/RESULTS.md`; failure → add remediation tasks. Install k6 via `https://k6.io/docs/getting-started/installation/`.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)** has no dependencies — can start immediately
- **Foundational (Phase 2)** depends on Setup completion — **BLOCKS all user stories**
- **User Stories (Phase 3-6)** all depend on Foundational phase completion
  - US1 (P1): No story deps after Foundational. Builds Router (T040) + DeployDemo (T044).
  - US2 (P2): Depends on US1 for Router base (T040). Independently testable.
  - US3 (P3): Depends on US1 for Router base (T040). Independently testable; no US2 dep.
  - US4 (P4): Depends on Foundational; can start in parallel with US1 but portfolio content meaningful after US1/US2/US3 produce state.
- **Polish (Phase 7)** depends on all desired user stories being complete

### Token Contract Dependencies

```
UniswapV2ERC20 (T014)
  └── UniswapV2Pair (T017) — LP token base
       └── UniswapV2Factory (T016) — CREATE2 deployer
            └── UniswapV2Router02 (T040) — periphery
                 ├── US2 addLiquidity (T048)
                 ├── US3 removeLiquidity (T054)
                 └── US1 swap (T040 swap methods)
```

### Frontend Hook Dependencies

```
useWeb3 (T025)
  ├── useToken (T028) — needs provider/signer
  ├── usePair (T029) — needs provider + addresses.ts
  │     ├── useSwap (T041) — needs usePair.getAmountOut
  │     ├── useLiquidity (T049/T055) — needs usePair + useToken
  │     └── usePortfolio (T064) — needs usePair events
  └── useTwapPrice (T030) — needs usePair cumulative prices
```

### Within Each User Story (TDD)

1. Tests written FIRST and they must FAIL before implementation
2. Interfaces + libraries before Router implementation (US1)
3. Router implementation before frontend hook
4. Frontend hook before component
5. Component before page
6. Demo/deploy script + validation last

### Parallel Opportunities

- **Phase 1**: T002, T003, T004, T005, T006, T007 all [P] — different files, no deps
- **Phase 2 contracts**: T009, T010, T011, T013, T014, T015, T018, T019 [P] — distinct source files
- **Phase 2 frontend**: T021, T022, T023, T024, T025, T026, T027, T028, T029, T030 [P] — different components/hooks
- **Per US**: all test tasks [P] within that story; interface+library tasks [P] within US1
- **Phase 7**: T065–T073 all [P] — different quality gates

## Parallel Example: User Story 1

```bash
# Step 1: Launch all US1 tests together (FAIL first):
Task: "UniswapV2Library.t.sol"                 (T032)
Task: "TransferHelper.t.sol"                    (T033)
Task: "UniswapV2Router02 swap tests"            (T034)
Task: "useSwap.test.ts"                         (T035)
Task: "SwapWidget.test.tsx"                     (T036)

# Step 2: Parallel interface + library implementations:
Task: "IUniswapV2Router02/IERC20/IWETH interfaces"  (T037)
Task: "UniswapV2Library.sol"                         (T038)
Task: "TransferHelper.sol"                            (T039)

# Step 3: Router (depends on T038 library):
Task: "UniswapV2Router02.sol"                     (T040)

# Step 4: Frontend hook + component in parallel (both depend on T040):
Task: "useSwap.ts"    (T041)
Task: "SwapWidget.tsx" (T042)  # can scaffold while T041 builds
```

## Parallel Example: User Story 2 & 3

```bash
# US2 tests (can run in parallel with US3 tests — different test files):
Task: "Router addLiquidity tests"  (T046)
Task: "useLiquidity add + AddLiquidity tests" (T047)

# US3 tests:
Task: "Router removeLiquidity tests" (T052)
Task: "useLiquidity remove + RemoveLiquidity tests" (T053)

# US2 implementation (sequential: Router→hook→component):
Task: "Router addLiquidity" (T048)
Task: "useLiquidity add methods" (T049)
Task: "AddLiquidity.tsx" (T050)
Task: "liquidity/page.tsx" (T051)

# US3 implementation (sequential: Router→hook→component — can run in parallel with US2):
Task: "Router removeLiquidity" (T054)
Task: "useLiquidity remove methods" (T055)
Task: "RemoveLiquidity.tsx" (T056)
Task: "liquidity/page.tsx tab" (T057)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001–T008)
2. Complete Phase 2: Foundational (T009–T031)
3. Complete Phase 3: User Story 1 — Token Swap (T032–T045)
4. **STOP and VALIDATE**: Run quickstart.md Scenario A — swap WETH→USDC end-to-end, verify SC-001
5. Deploy/demo if ready (anvil + Sepolia)

### Incremental Delivery

1. Setup + Foundational → foundation ready
2. + US1: Swap → test independently → MVP demo (anvil + Sepolia)
3. + US2: Add Liquidity → test independently → demo
4. + US3: Remove Liquidity → test independently → demo
5. + US4: Portfolio & Analytics → test independently → demo (SC-004 < 3s)
6. Polish → Sepolia public demo + CI green + README complete

### Parallel Team Strategy

With multiple developers / AI agents:

1. Team completes Setup + Foundational together (Phase 1-2)
2. Post-Foundational parallel:
   - **Developer A**: US1 (swap) — full Router swap paths + SwapWidget + /swap page
   - **Developer B**: US2 (add liquidity) — Router add paths + AddLiquidity + /liquidity Add tab
   - **Developer C**: US3 (remove liquidity) — Router remove paths + RemoveLiquidity + /liquidity Remove tab (can start once US2's Router add stubs exist)
   - **Developer D**: US4 (portfolio) — /api/reserves + PositionCard + /portfolio page + events aggregation (can start once Phase 2 done; uses read-only state)
3. Stories complete and integrate independently; cross-cutting Polish (Phase 7) runs after all stories done

---

## Notes

- **[P]** tasks = different files, no dependencies on incomplete tasks — can run in parallel
- **[FOUND]**, **[US1]**, **[US2]**, **[US3]**, **[US4]** labels map task to story for traceability
- **TDD**: Tests written FIRST, verified they FAIL, then implementation — Constitution III
- **Router02** implemented incrementally: US1 builds swap paths (T040), US2 adds liquidity paths (T048), US3 adds removal paths (T054)
- **Each user story independently testable** with its own stop-checkpoint
- Commit after each task or logical group; CI runs on push
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence

# CONTRACTS — Foundry + Solidity

**Generated:** 2026-07-26

## OVERVIEW
Foundry project for Uniswap V2–style DEX smart contracts. Currently a minimal Counter scaffold; real contracts pending per `specs/001-uniswap-v2-resume/plan.md`.

## STRUCTURE
```
contracts/
├── src/
│   ├── Counter.sol        # Example contract (placeholder)
│   ├── interfaces/         # [EMPTY] — scaffolded for UniswapV2 interfaces
│   └── libraries/          # [EMPTY] — scaffolded for Math/UQ112x112
├── test/Counter.t.sol      # Foundry tests (*.t.sol convention)
├── script/Counter.s.sol    # Deploy scripts (*.s.sol convention)
├── .github/workflows/      # ⚠️ Misplaced — needs root .github/
├── lib/                    # Git submodules (gitignored: forge-std, openzeppelin)
└── foundry.toml
```

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| Main contract | src/Counter.sol | Only contract; 14-line example |
| Tests | test/Counter.t.sol | Forge test; imports forge-std/Test.sol |
| Deploy script | script/Counter.s.sol | forge script entry; imports forge-std/Script.sol |
| Foundry config | foundry.toml | Default profile; no optimizer/evm_version set |
| CI | .github/workflows/test.yml | ⚠️ Won't run — move to root .github/workflows/ |
| Dependencies | .gitmodules | forge-std v1.16.2; OZ in lib/ but not tracked |

## CONVENTIONS
- **Compiler**: pragma solidity ^0.8.13
- **Test framework**: forge-std v1.16.2 (Test, StdAssertions, StdCheats)
- **Test naming**: `{Contract}Test is Test`; `test_*()` unit, `testFuzz_*()` fuzz
- **Deploy scripts**: `{Contract}Script is Script` with `run()` entry
- **Format**: `forge fmt`; CI: `forge fmt --check`
- **Build**: `forge build --sizes` (contract size check in CI)
- **CI order**: fmt --check → build --sizes → test -vvv

## NOTES
- **lib/ is gitignored**: Run `forge install` after clone
- **OpenZeppelin**: Present in lib/ but NOT in .gitmodules
- **CI is misplaced**: Move to `../.github/workflows/test.yml`
- **interfaces/ and libraries/ are empty**: Intended for Uniswap V2 core per plan.md

# Repository Guide for OpenCode

This is a monorepo for a DeFi application, split into two independent packages: `contracts/` (Solidity/Foundry) and `frontend/` (React/Vite).

## Structure
- `contracts/`: Foundry project for Ethereum smart contracts.
- `frontend/`: React + TypeScript + Vite frontend.
- `.specify/`: Feature planning and specs (use `/speckit.*` commands).
- `.opencode/`: OpenCode-specific configuration and commands.

## Commands

### Frontend (`frontend/`)
- **Dev server**: `npm run dev`
- **Build**: `npm run build` (runs `tsc -b && vite build`)
- **Lint**: `npm run lint`
- **Preview**: `npm run preview`

### Contracts (`contracts/`)
- **Build**: `forge build`
- **Test**: `forge test`
- **Format**: `forge fmt`
- **Deploy**: `forge script script/Counter.s.sol:CounterScript --rpc-url <rpc> --private-key <key>`
- **CI Order**: `forge fmt --check` → `forge build --sizes` → `forge test -vvv`

## Key Conventions
- **No Root `opencode.json`**: Configuration is per-package or via `.opencode/`.
- **Foundry Libs**: `contracts/lib/` is gitignored; run `forge install` if it's missing.
- **React Tooling**: Frontend uses `@vitejs/plugin-react` (Oxc-based).
- **Planning**: Use `/speckit.specify`, `/speckit.plan`, and `/speckit.tasks` to manage features via the `.specify` system.

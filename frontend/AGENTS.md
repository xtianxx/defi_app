# FRONTEND — React + TypeScript + Vite

**Generated:** 2026-07-26

## OVERVIEW
React 19 + TypeScript 6 + Vite 8 frontend for the Uniswap V2 dApp. Currently a minimal Vite scaffold; real DeFi UI pending per `specs/001-uniswap-v2-resume/plan.md`.

## STRUCTURE
```
frontend/
├── src/
│   ├── main.tsx            # React entry — createRoot, renders <App/>
│   ├── App.tsx             # Root component (default Vite template, 122 lines)
│   ├── App.css             # App styles
│   ├── index.css           # Global styles
│   ├── assets/             # hero.png, react.svg, vite.svg
│   └── hooks/              # [EMPTY] — scaffolded for useWeb3, useToken, etc.
├── public/                 # favicon.svg, icons.svg
├── package.json            # React 19, Vite 8, TS ~6.0.2, ESLint 10
├── vite.config.ts          # @vitejs/plugin-react (Oxc)
├── tsconfig.json           # Project references hub
├── tsconfig.app.json       # App config: es2023, jsx react-jsx, strict flags
├── tsconfig.node.json      # Node config: nodenext, for vite.config.ts
├── eslint.config.js        # Flat config: js + tseslint + react-hooks + react-refresh
└── index.html              # Vite HTML entry
```

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| App entry | src/main.tsx | createRoot on #root |
| Root component | src/App.tsx | Single component; no routing |
| Vite config | vite.config.ts | Oxc React plugin; no aliases/proxy |
| TS app config | tsconfig.app.json | noEmit:true, noUnusedLocals, verbatimModuleSyntax |
| TS node config | tsconfig.node.json | module nodenext, lib ES2023 |
| ESLint | eslint.config.js | ES10 flat config, recommended presets only |
| Custom hooks | src/hooks/ | [EMPTY] |

## CONVENTIONS
- **TS 6 strict**: noUnusedLocals, noUnusedParameters, erasableSyntaxOnly, verbatimModuleSyntax, noFallthroughCasesInSwitch
- **noEmit: true** — TS is type-check only; Vite handles bundling
- **moduleResolution: bundler** — Vite-native resolution
- **Imports**: Direct file references (./App.tsx); no path aliases
- **No router** — single-page; plan.md specifies Next.js App Router migration
- **No Web3 library** — ethers/wagmi/viem not installed
- **No test framework** — add via `npm install -D vitest`
- **No CSS framework** — plan.md specifies Tailwind + shadcn/ui

## NOTES
- **Build**: `tsc -b` (type-check) → `vite build`
- **No .env.example**: Add with RPC_URL, contract addresses before deploying
- **No CI for frontend**: Only contracts have CI; add separately
- **hooks/ is empty**: Intended for useWeb3, useToken, usePair, useSwap, useLiquidity
- **Migration planned**: Vite → Next.js 15 per constitution amendment (plan.md)

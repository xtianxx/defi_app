// sync-deploy.ts — read `contracts/broadcast/<chainId>/run-latest.json` + ABI
// artifacts from `contracts/out/` and regenerate addresses.ts + abis.ts.
// Spec: contracts/frontend-module-api.md §3 (multi-chain), research.md R0.9.

import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface BroadcastTx {
  contractName?: string;
  contractAddress?: string;
  function?: string;
  transactionType?: string;
}

interface BroadcastFile {
  chain?: number;
  transactions?: BroadcastTx[];
}

interface Deployment {
  factory: string;
  router: string;
  weth: string;
  faucet: string;
  tokens: { WETH: string; USDC: string; DAI: string; WBTC: string };
}

const ZERO = "0x0000000000000000000000000000000000000000";

// Hardcoded multi-chain set; no CLI args (AGENTS.md convention). Defined locally
// because this script runs as plain node ESM (cannot import TS modules without
// extension gymnastics). Keep in sync with frontend/src/lib/chains.ts.
const ANVIL_CHAIN_ID = 31337;
const SEPOLIA_CHAIN_ID = 11155111;
const chainIds = [ANVIL_CHAIN_ID, SEPOLIA_CHAIN_ID];

function repoRoot(): string {
  // frontend/scripts/sync-deploy.ts -> frontend/ -> repo root
  return resolve(__dirname, "..", "..");
}

function readBroadcast(chainId: number): BroadcastFile | null {
  // Forge saves broadcasts under `broadcast/<script_name>/<chainId>/run-latest.json`,
  // with one subdirectory per script. Scan all script subdirs and merge transactions
  // so a multi-script deployment (e.g. DeployFactory + DeployRouter + DeployDev)
  // is captured correctly.
  const broadcastDir = join(repoRoot(), "contracts", "broadcast");
  if (!existsSync(broadcastDir)) return null;
  const merged: BroadcastFile = { chain: chainId, transactions: [] };
  for (const entry of readdirSync(broadcastDir)) {
    const path = join(broadcastDir, entry, String(chainId), "run-latest.json");
    if (!existsSync(path)) continue;
    const file = JSON.parse(readFileSync(path, "utf8")) as BroadcastFile;
    if (file.transactions) {
      merged.transactions!.push(...file.transactions);
    }
  }
  if (merged.transactions!.length === 0) return null;
  return merged;
}

function findContractAddress(broadcast: BroadcastFile, contractName: string): string {
  for (const tx of broadcast.transactions ?? []) {
    if (tx.contractName === contractName && tx.contractAddress) {
      return tx.contractAddress;
    }
  }
  return ZERO;
}

/**
 * Find the Nth (0-indexed) CREATE deployment of `contractName`.
 * Used to disambiguate multiple MockERC20 deployments (USDC=0, DAI=1, WBTC=2)
 * which all share the same contractName in the broadcast file.
 */
function findNthContractAddress(broadcast: BroadcastFile, contractName: string, index: number): string {
  let seen = 0;
  for (const tx of broadcast.transactions ?? []) {
    if (tx.transactionType === "CREATE" && tx.contractName === contractName && tx.contractAddress) {
      if (seen === index) return tx.contractAddress;
      seen++;
    }
  }
  return ZERO;
}

function zeroDeployment(): Deployment {
  return {
    factory: ZERO,
    router: ZERO,
    weth: ZERO,
    faucet: ZERO,
    tokens: { WETH: ZERO, USDC: ZERO, DAI: ZERO, WBTC: ZERO },
  };
}

/**
 * Best-effort read of the committed `DEPLOYMENTS` entry for `chainId` from the
 * tracked src/lib/contracts/addresses.ts. sync-deploy writes one entry per line
 * (JSON.stringify produces a single line), so each line can be matched
 * independently. Returns null when the chain has no committed entry or the file
 * cannot be parsed.
 */
function readCommittedDeployment(chainId: number): Deployment | null {
  const path = join(repoRoot(), "frontend", "src", "lib", "contracts", "addresses.ts");
  if (!existsSync(path)) return null;
  const content = readFileSync(path, "utf8");
  const header = content.indexOf("DEPLOYMENTS");
  if (header === -1) return null;
  const blockEnd = content.indexOf("};", header);
  const block = content.slice(header, blockEnd === -1 ? content.length : blockEnd + 2);

  const entry = /^\s*(\[[^\]]+\]|\d+):\s*(\{.*\}),?\s*(?:\/\/.*)?$/;
  for (const line of block.split("\n")) {
    const m = entry.exec(line);
    if (!m) continue;
    if (resolveDeploymentKey(m[1]) !== chainId) continue;
    try {
      const raw = JSON.parse(m[2]) as Partial<Deployment>;
      if (!raw || typeof raw !== "object") return null;
      return {
        factory: raw.factory ?? ZERO,
        router: raw.router ?? ZERO,
        weth: raw.weth ?? ZERO,
        faucet: raw.faucet ?? ZERO,
        tokens: {
          WETH: raw.tokens?.WETH ?? ZERO,
          USDC: raw.tokens?.USDC ?? ZERO,
          DAI: raw.tokens?.DAI ?? ZERO,
          WBTC: raw.tokens?.WBTC ?? ZERO,
        },
      };
    } catch {
      return null;
    }
  }
  return null;
}

/** Map a generated DEPLOYMENTS key (`[ANVIL_CHAIN_ID]`, `11155111`, ...) to a chain id. */
function resolveDeploymentKey(keyText: string): number | null {
  const inner = keyText.trim().replace(/^\[|\]$/g, "").trim();
  if (inner === "ANVIL_CHAIN_ID") return ANVIL_CHAIN_ID;
  if (inner === "SEPOLIA_CHAIN_ID") return SEPOLIA_CHAIN_ID;
  const n = Number(inner);
  return Number.isFinite(n) ? n : null;
}

function buildDeployment(chainId: number): Deployment {
  const broadcast = readBroadcast(chainId);
  if (!broadcast) {
    // Missing broadcast for this chain: keep the already-committed values from
    // the tracked addresses.ts (frontend-module-api.md §3 — a missing broadcast
    // must NEVER clobber the other chain's committed addresses); fall back to
    // ZERO when nothing is committed.
    const committed = readCommittedDeployment(chainId);
    if (committed) {
      console.warn(`sync-deploy: no broadcast for chain ${chainId} — keeping committed addresses from addresses.ts`);
      return committed;
    }
    console.warn(`sync-deploy: no broadcast for chain ${chainId} — writing ZERO addresses`);
    return zeroDeployment();
  }
  return {
    factory: findContractAddress(broadcast, "UniswapV2Factory"),
    router: findContractAddress(broadcast, "UniswapV2Router02"),
    weth: findContractAddress(broadcast, "WETH9"),
    faucet: findContractAddress(broadcast, "DemoFaucet"),
    tokens: {
      WETH: findContractAddress(broadcast, "WETH9"),
      // DeployDemo deploys MockERC20 in order: USDC, DAI, WBTC.
      // All three share contractName "MockERC20", so disambiguate by CREATE order.
      USDC: findNthContractAddress(broadcast, "MockERC20", 0),
      DAI: findNthContractAddress(broadcast, "MockERC20", 1),
      WBTC: findNthContractAddress(broadcast, "MockERC20", 2),
    },
  };
}

function readAbi(contractName: string): unknown[] | null {
  const path = join(repoRoot(), "contracts", "out", `${contractName}.sol`, `${contractName}.json`);
  if (!existsSync(path)) return null;
  const json = JSON.parse(readFileSync(path, "utf8")) as { abi?: unknown[] };
  return json.abi ?? null;
}

function listOutContracts(): string[] {
  const outDir = join(repoRoot(), "contracts", "out");
  if (!existsSync(outDir)) return [];
  return readdirSync(outDir)
    .filter((d) => d.endsWith(".sol"))
    .map((d) => d.replace(/\.sol$/, ""));
}

function writeAddresses(deployments: Record<number, Deployment>): void {
  const path = join(repoRoot(), "frontend", "src", "lib", "contracts", "addresses.ts");
  const lines: string[] = [];
  for (const id of chainIds) {
    if (id === SEPOLIA_CHAIN_ID) lines.push("  // Sepolia (chainId 11155111)");
    // ANVIL_CHAIN_ID keeps the computed-key form (matches the import above);
    // Sepolia uses a raw numeric key (frontend-module-api.md §3 shows raw keys)
    // so the generated file never depends on chains.ts exports.
    const key = id === ANVIL_CHAIN_ID ? "[ANVIL_CHAIN_ID]" : String(id);
    lines.push(`  ${key}: ${JSON.stringify(deployments[id] ?? null)},`);
  }
  const content = `// AUTO-GENERATED by scripts/sync-deploy.ts — do not edit by hand.
import { ANVIL_CHAIN_ID } from "../chains";

const ZERO = "0x0000000000000000000000000000000000000000" as const;

export interface Deployment {
  factory: \`0x\${string}\`;
  router: \`0x\${string}\`;
  weth: \`0x\${string}\`;
  faucet: \`0x\${string}\`;
  tokens: {
    WETH: \`0x\${string}\`;
    USDC: \`0x\${string}\`;
    DAI: \`0x\${string}\`;
    WBTC: \`0x\${string}\`;
  };
}

export const DEPLOYMENTS: Record<number, Deployment> = {
${lines.join("\n")}
};

export function getDeployment(chainId: number | null): Deployment | null {
  if (chainId === null) return null;
  return DEPLOYMENTS[chainId] ?? null;
}

export function isDeploymentConfigured(d: Deployment | null | undefined): d is Deployment {
  if (!d) return false;
  return d.factory !== ZERO && d.router !== ZERO && d.weth !== ZERO;
}
`;
  writeFileSync(path, content, "utf8");
}

function writeTokens(deployments: Record<number, Deployment>): void {
  const path = join(repoRoot(), "frontend", "src", "lib", "contracts", "tokens.ts");
  const anvil = deployments[ANVIL_CHAIN_ID] ?? null;
  const sepolia = deployments[SEPOLIA_CHAIN_ID] ?? null;

  function addr(val: string | undefined): string {
    if (!val || val === ZERO) return "null";
    return `"${val}" as \`0x\${string}\``;
  }

  const content = `// AUTO-GENERATED by scripts/sync-deploy.ts — do not edit by hand.

const PLACEHOLDER = "0x0000000000000000000000000000000000000000" as const;
function makeAddresses(a31337: \`0x\${string}\` | null, a11155111: \`0x\${string}\` | null): Record<number, \`0x\${string}\` | null> {
  return { 31337: a31337, 11155111: a11155111 };
}

// Static metadata; addresses filled in by sync-deploy.
export const TOKENS = {
  WETH: { symbol: "WETH" as const, name: "Wrapped Ether", decimals: 18, addressByChain: makeAddresses(${addr(anvil?.tokens.WETH)}, ${addr(sepolia?.tokens.WETH)}) },
  USDC: { symbol: "USDC" as const, name: "USD Coin", decimals: 6, addressByChain: makeAddresses(${addr(anvil?.tokens.USDC)}, ${addr(sepolia?.tokens.USDC)}) },
  DAI:  { symbol: "DAI" as const,  name: "Dai Stablecoin", decimals: 18, addressByChain: makeAddresses(${addr(anvil?.tokens.DAI)}, ${addr(sepolia?.tokens.DAI)}) },
  WBTC: { symbol: "WBTC" as const, name: "Wrapped BTC",  decimals: 8,  addressByChain: makeAddresses(${addr(anvil?.tokens.WBTC)}, ${addr(sepolia?.tokens.WBTC)}) },
};

export const TOKEN_LIST = Object.values(TOKENS);
export const KNOWN_PAIRS = [
  ["WETH", "USDC"],
  ["WETH", "DAI"],
  ["WETH", "WBTC"],
  ["USDC", "DAI"],
  ["USDC", "WBTC"],
  ["DAI", "WBTC"],
] as const;

export function getToken(symbol: "WETH" | "USDC" | "DAI" | "WBTC") { return TOKENS[symbol]; }
export function getTokenAddress(symbol: "WETH" | "USDC" | "DAI" | "WBTC", chainId: number) { return TOKENS[symbol].addressByChain[chainId] ?? null; }
export function isValidAddress(addr: string | null | undefined): addr is \`0x\${string}\` {
  return typeof addr === "string" && addr.length === 42 && addr.startsWith("0x") && addr !== PLACEHOLDER;
}
`;
  writeFileSync(path, content, "utf8");
}

function writeAbis(): void {
  const contracts = listOutContracts();
  const entries: string[] = [];
  for (const name of contracts) {
    const abi = readAbi(name);
    if (!abi) continue;
    // Serialize as JSON for embedding in a TS file.
    entries.push(`export const ${name}_ABI = ${JSON.stringify(abi, null, 2)} as const;`);
  }
  const content = `// AUTO-GENERATED by scripts/sync-deploy.ts — do not edit by hand.\n\n${entries.join("\n\n")}\n`;
  const path = join(repoRoot(), "frontend", "src", "lib", "contracts", "abis.generated.ts");
  writeFileSync(path, content, "utf8");
}

function main(): void {
  const deployments: Record<number, Deployment> = {};
  for (const id of chainIds) {
    deployments[id] = buildDeployment(id);
  }
  writeAddresses(deployments);
  writeTokens(deployments);
  writeAbis();

  const contracts = listOutContracts();
  if (contracts.length > 0) {
    console.log(`Wrote addresses.ts, tokens.ts, and abis.generated.ts (${contracts.length} contracts).`);
  } else {
    console.log("Wrote addresses.ts and tokens.ts. No compiled ABIs in contracts/out — run `forge build` to populate.");
  }
}

main();

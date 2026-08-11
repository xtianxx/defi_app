# contracts — Uniswap V2–style DEX (Foundry)

Foundry package for the [Uniswap V2–style DEX](../README.md): a re-implementation of
Uniswap V2 core and periphery. Solidity ^0.8.19, via-IR, optimizer 200 runs.

- **Core** — `src/core/`: `Factory`, `Pair`, LP `ERC20` (+ `Math`, `SafeMath`,
  `UQ112x112`). Constant-product AMM (`x·y=k`), 0.3% swap fee, TWAP price oracles.
- **Router** — `src/router/`: `Router02`, `WETH9`, `UniswapV2Library`, `TransferHelper`.
- **Scripts** — `script/DeployDemo.s.sol`: deploys Factory + Router + WETH9 + 4 tokens
  with 2 seeded pairs (main demo); `core/DeployFactory.s.sol`, `router/DeployRouter.s.sol`.
- **Tests** — `test/`: unit + fuzz tests for core and router.

## Usage

```shell
forge build            # build (via-IR)
forge test -vvv        # run all tests
forge test --coverage  # ≥ 95% line coverage
forge fmt              # format
forge snapshot         # gas snapshot
```

Deploy the demo against a local anvil (chainId 31337):

```shell
forge script script/DeployDemo.s.sol:DeployDemo \
  --rpc-url http://127.0.0.1:8545 \
  --broadcast --slow \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
```

Then sync the deployed addresses + ABIs into the frontend:

```shell
cd ../frontend && npm run sync-deploy
```

For the full local loop (fresh anvil → deploy → sync → tests), run
`../scripts/test-e2e.sh` or `../scripts/dev-deploy.sh` from the repo root.

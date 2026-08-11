// Sepolia 演示账户（测试网专用，零真实价值）。
// 信息镜像 specs/002-sepolia-vercel-deploy/demo-guide.md（含私钥，仅供测试网演示导入）。
// 用途：当用户 gas 不足时（水龙头只发代币不发 ETH），提示导入演示账户继续演示。

export interface DemoAccount {
  label: string;
  address: string;
  privateKey: string;
}

export const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    label: "LP Provider",
    address: "0x55a5818d1F4b21C5D2F4b898Ff986cA29934A984",
    privateKey: "0xb1c3ad1c7a34fc9b4909d9fe904e790cd68e4ee968834e3541f466d238d18e48",
  },
  {
    label: "Swapper",
    address: "0x61e223dA8bafd9f39e749685CB7653Cf1C3b8096",
    privateKey: "0x202a70922f45673f3e3cf3facd76bc382774b5f69ef0f82b555ffad61569b31a",
  },
];

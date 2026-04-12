import type { Hex } from "viem";

export const CHAIN_ID = parseInt(process.env.CHAIN_ID || "2651420", 10);
export const RPC_URL = process.env.RPC_URL || "https://horizen-testnet.rpc.caldera.xyz/http";
export const RELAYER_URL = process.env.RELAYER_URL || "http://localhost:3001";
export const SUBGRAPH_URL = process.env.SUBGRAPH_URL || "https://api.goldsky.com/api/public/project_cmhp1xyw0qu8901xcdayke69d/subgraphs/wraith-stealth-horizen-testnet-horizen-testnet/2.0.0/gn";
export const EXPLORER_URL = "https://horizen-testnet.explorer.caldera.xyz";

export const ANNOUNCER_ADDRESS: Hex = "0x8AE65c05E7eb48B9bA652781Bc0a3DBA09A484F3";
export const REGISTRY_ADDRESS: Hex = "0x953E6cEdcdfAe321796e7637d33653F6Ce05c527";
export const WRAITH_SENDER_ADDRESS: Hex = "0x226C5eb4e139D9fa01cc09eA318638b090b12095";
export const WRAITH_WITHDRAWER_ADDRESS: Hex = "0x9F7f1C9d8B5a83245c6fC8415Ef744C458101711";
export const WRAITH_NAMES_ADDRESS: Hex = "0x3d46f709a99A3910f52bD292211Eb5D557F882D6";

export const TOKENS: Record<string, { address: Hex | "native"; decimals: number }> = {
  ETH: { address: "native", decimals: 18 },
  ZEN: { address: "0x4b36cb6E7c257E9aA246122a997be0F7Dc1eFCd1", decimals: 18 },
  USDC: { address: "0x01c7AEb2A0428b4159c0E333712f40e127aF639E", decimals: 6 },
};

export const WRAITH_SENDER_ABI = [
  {
    type: "function",
    name: "sendETH",
    inputs: [
      { name: "schemeId", type: "uint256" },
      { name: "stealthAddress", type: "address" },
      { name: "ephemeralPubKey", type: "bytes" },
      { name: "metadata", type: "bytes" },
    ],
    outputs: [],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "sendERC20",
    inputs: [
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "schemeId", type: "uint256" },
      { name: "stealthAddress", type: "address" },
      { name: "ephemeralPubKey", type: "bytes" },
      { name: "metadata", type: "bytes" },
    ],
    outputs: [],
    stateMutability: "payable",
  },
] as const;

export const WRAITH_NAMES_ABI = [
  {
    type: "function",
    name: "resolve",
    inputs: [{ name: "name", type: "string" }],
    outputs: [{ name: "", type: "bytes" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "nameOf",
    inputs: [{ name: "stealthMetaAddress", type: "bytes" }],
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
  },
] as const;

export function txUrl(hash: string): string {
  return `${EXPLORER_URL}/tx/${hash}`;
}

export function addressUrl(address: string): string {
  return `${EXPLORER_URL}/address/${address}`;
}

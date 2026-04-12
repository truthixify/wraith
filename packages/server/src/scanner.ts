import { createPublicClient, http, erc20Abi, formatEther, formatUnits, type Hex, type PublicClient } from "viem";
import { defineChain } from "viem";
import { RPC_URL, CHAIN_ID, SUBGRAPH_URL, TOKENS } from "./config.js";
import type { HexString, Announcement } from "@wraith-horizen/sdk";

const chain = defineChain({
  id: CHAIN_ID,
  name: "Horizen Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
});

const publicClient: PublicClient = createPublicClient({ chain, transport: http(RPC_URL) });

export { publicClient };

const ANNOUNCEMENTS_QUERY = `
  query($first: Int!, $skip: Int!) {
    announcements(
      first: $first
      skip: $skip
      where: { schemeId: "1" }
      orderBy: block_number
      orderDirection: asc
    ) {
      schemeId
      stealthAddress
      caller
      ephemeralPubKey
      metadata
    }
  }
`;

/**
 * Fetches all stealth announcements from the Goldsky subgraph.
 */
export async function fetchAllAnnouncements(): Promise<Announcement[]> {
  const all: Announcement[] = [];
  let skip = 0;
  const first = 1000;

  while (true) {
    const res = await fetch(SUBGRAPH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: ANNOUNCEMENTS_QUERY,
        variables: { first, skip },
      }),
    });

    const json = (await res.json()) as { data?: { announcements?: any[] } };
    const items = json.data?.announcements ?? [];

    for (const item of items) {
      all.push({
        schemeId: BigInt(item.schemeId),
        stealthAddress: item.stealthAddress as HexString,
        caller: item.caller as HexString,
        ephemeralPubKey: item.ephemeralPubKey as HexString,
        metadata: item.metadata as HexString,
      });
    }

    if (items.length < first) break;
    skip += first;
  }

  return all;
}

/**
 * Checks whether a stealth address has received a payment of at least the expected amount.
 */
export async function checkPayment(
  stealthAddress: Hex,
  expectedAmount: number,
  asset: string = "ETH"
): Promise<boolean> {
  try {
    if (asset === "ETH") {
      const balance = await publicClient.getBalance({ address: stealthAddress });
      return Number(formatEther(balance)) >= expectedAmount;
    }

    const token = TOKENS[asset];
    if (!token || token.address === "native") return false;

    const balance = await publicClient.readContract({
      address: token.address as Hex,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [stealthAddress],
    });

    return Number(formatUnits(balance, token.decimals)) >= expectedAmount;
  } catch {
    return false;
  }
}

/**
 * Polls for a payment with retries and a timeout.
 */
export async function waitForPayment(
  stealthAddress: Hex,
  expectedAmount: number,
  asset: string = "ETH",
  timeoutMs = 5 * 60 * 1000,
  intervalMs = 3000
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const found = await checkPayment(stealthAddress, expectedAmount, asset);
    if (found) return true;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  return false;
}

/**
 * Gets the ETH + ERC-20 balances for an address.
 */
export async function getBalances(address: Hex): Promise<{ asset: string; balance: string }[]> {
  const results: { asset: string; balance: string }[] = [];

  const ethBalance = await publicClient.getBalance({ address });
  results.push({ asset: "ETH", balance: formatEther(ethBalance) });

  for (const [symbol, token] of Object.entries(TOKENS)) {
    if (token.address === "native") continue;
    try {
      const bal = await publicClient.readContract({
        address: token.address as Hex,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [address],
      });
      if (bal > 0n) {
        results.push({ asset: symbol, balance: formatUnits(bal, token.decimals) });
      }
    } catch {
      // Token contract may not exist or address not funded
    }
  }

  return results;
}

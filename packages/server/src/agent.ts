import { randomUUID } from "crypto";
import {
  createWalletClient,
  http,
  parseEther,
  parseUnits,
  formatEther,
  formatUnits,
  erc20Abi,
  type Hex,
} from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { defineChain } from "viem";
import {
  deriveStealthKeys,
  encodeStealthMetaAddress,
  decodeStealthMetaAddress,
  generateStealthAddress,
  scanAnnouncements,
  deriveStealthPrivateKey,
  signNameRegistrationOnBehalf,
  metaAddressToBytes,
  STEALTH_SIGNING_MESSAGE,
  SCHEME_ID,
} from "@wraith-horizen/sdk";
import type { StealthKeys, HexString } from "@wraith-horizen/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import db from "./db.js";
import { encrypt, decrypt } from "./crypto.js";
import {
  publicClient,
  fetchAllAnnouncements,
  getBalances,
} from "./scanner.js";
import {
  RPC_URL,
  CHAIN_ID,
  RELAYER_URL,
  EXPLORER_URL,
  WRAITH_SENDER_ADDRESS,
  WRAITH_NAMES_ADDRESS,
  WRAITH_SENDER_ABI,
  WRAITH_NAMES_ABI,
  TOKENS,
  txUrl,
  addressUrl,
} from "./config.js";

const chain = defineChain({
  id: CHAIN_ID,
  name: "Horizen Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
});

const DEPLOYER_KEY = process.env.PRIVATE_KEY as Hex;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";

function cleanError(err: any): string {
  const msg = err?.shortMessage || err?.message || "Unknown error";
  if (msg.includes("insufficient funds")) return "Insufficient balance to cover gas + value.";
  if (msg.includes("execution reverted")) return msg.split("\n")[0];
  if (msg.length > 200) return msg.slice(0, 200).split("\n")[0];
  return msg;
}

function formatHumanDate(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000);
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const diffH = Math.round(diffMs / (1000 * 60 * 60));
  const diffD = Math.round(diffMs / (1000 * 60 * 60 * 24));
  const timeStr = d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
  if (diffMs < 0) return timeStr;
  if (diffH < 1) return `in ~${Math.max(1, Math.round(diffMs / 60000))} min (${timeStr})`;
  if (diffH < 24) return `in ~${diffH} hour${diffH > 1 ? "s" : ""} (${timeStr})`;
  if (diffD === 1) return `tomorrow (${timeStr})`;
  return `in ${diffD} days (${timeStr})`;
}

function createNotification(agentId: string, type: string, title: string, body: string) {
  db.prepare(
    "INSERT INTO notifications (agent_id, type, title, body) VALUES (?, ?, ?, ?)"
  ).run(agentId, type, title, body);
}

export interface AgentInfo {
  id: string;
  name: string;
  address: string;
  metaAddress: string;
}

interface AgentRow {
  id: string;
  name: string;
  owner_wallet: string | null;
  address: string;
  encrypted_secret: string;
  meta_address: string;
  created_at: number;
}

function rowToInfo(row: AgentRow): AgentInfo {
  return { id: row.id, name: row.name, address: row.address, metaAddress: row.meta_address };
}

async function deriveAgentStealthKeys(privateKey: Hex): Promise<StealthKeys> {
  const account = privateKeyToAccount(privateKey);
  const signature = await account.signMessage({ message: STEALTH_SIGNING_MESSAGE });
  return deriveStealthKeys(signature as HexString);
}

async function resolveWraithName(name: string): Promise<string | null> {
  try {
    const result = await publicClient.readContract({
      address: WRAITH_NAMES_ADDRESS,
      abi: WRAITH_NAMES_ABI,
      functionName: "resolve",
      args: [name],
    });
    const hex = result as string;
    if (!hex || hex === "0x" || hex.length < 4) return null;
    return `st:eth:${hex}`;
  } catch {
    return null;
  }
}

export async function createAgent(name: string, ownerWallet?: string): Promise<AgentInfo> {
  const cleanName = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (cleanName.length < 3) throw new Error("Name must be at least 3 characters");
  if (cleanName.length > 32) throw new Error("Name must be at most 32 characters");

  const existing = db.prepare("SELECT id FROM agents WHERE name = ?").get(cleanName);
  if (existing) throw new Error(`Agent name "${cleanName}" is already taken`);

  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  const stealthKeys = await deriveAgentStealthKeys(privateKey);
  const metaAddress = encodeStealthMetaAddress(stealthKeys.spendingPubKey, stealthKeys.viewingPubKey);

  // Fund the agent from the deployer wallet
  try {
    const deployerAccount = privateKeyToAccount(DEPLOYER_KEY);
    const deployerClient = createWalletClient({ account: deployerAccount, chain, transport: http(RPC_URL) });
    await deployerClient.sendTransaction({
      to: account.address,
      value: parseEther("0.01"),
    });
    console.log(`[agent] Funded ${account.address} with 0.01 ETH`);
  } catch (err: any) {
    console.warn(`[agent] Failed to fund agent: ${err.message}`);
  }

  // Register .wraith name via relayer (sponsored)
  try {
    const metaBytes = metaAddressToBytes(metaAddress);
    const nameSig = signNameRegistrationOnBehalf(cleanName, metaBytes, stealthKeys.spendingKey, 0n);
    const res = await fetch(`${RELAYER_URL}/register-name`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: cleanName, stealthMetaAddress: metaBytes, signature: nameSig }),
    });
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      console.warn(`[agent] Name registration failed: ${data.error}`);
    } else {
      console.log(`[agent] Registered name: ${cleanName}.wraith`);
    }
  } catch (err: any) {
    console.warn(`[agent] Name registration error: ${err.message}`);
  }

  const id = randomUUID();
  const encryptedSecret = encrypt(privateKey);

  db.prepare(
    "INSERT INTO agents (id, name, owner_wallet, address, encrypted_secret, meta_address) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(id, cleanName, ownerWallet?.toLowerCase() || null, account.address, encryptedSecret, metaAddress);

  return { id, name: cleanName, address: account.address, metaAddress };
}

export function getAgent(id: string): AgentInfo | null {
  const row = db.prepare("SELECT * FROM agents WHERE id = ?").get(id) as AgentRow | undefined;
  return row ? rowToInfo(row) : null;
}

export function getAgentByName(name: string): AgentInfo | null {
  const clean = name.toLowerCase().replace(/\.wraith$/, "");
  const row = db.prepare("SELECT * FROM agents WHERE name = ?").get(clean) as AgentRow | undefined;
  return row ? rowToInfo(row) : null;
}

export function getAgentByWallet(walletAddress: string): AgentInfo | null {
  const row = db.prepare("SELECT * FROM agents WHERE owner_wallet = ?").get(walletAddress.toLowerCase()) as AgentRow | undefined;
  return row ? rowToInfo(row) : null;
}

function getAgentSecret(id: string): Hex {
  const row = db.prepare("SELECT encrypted_secret FROM agents WHERE id = ?").get(id) as { encrypted_secret: string } | undefined;
  if (!row) throw new Error("Agent not found");
  return decrypt(row.encrypted_secret) as Hex;
}

// ---------------------------------------------------------------------------
// Tool implementations
// ---------------------------------------------------------------------------

async function toolSendPayment(
  agentId: string,
  recipient: string,
  amount: string,
  asset: string = "ETH"
): Promise<{ status: string; detail: string }> {
  const secret = getAgentSecret(agentId);
  const account = privateKeyToAccount(secret);
  const stealthKeys = await deriveAgentStealthKeys(secret);
  const walletClient = createWalletClient({ account, chain, transport: http(RPC_URL) });

  // Resolve recipient
  let metaAddress: string | null = null;
  const cleanRecipient = recipient.replace(/\.wraith$/i, "").toLowerCase();

  if (recipient.startsWith("st:eth:")) {
    metaAddress = recipient;
  } else if (/^[a-z0-9]+$/.test(cleanRecipient) && cleanRecipient.length >= 3) {
    metaAddress = await resolveWraithName(cleanRecipient);
    if (!metaAddress) return { status: "error", detail: `Name "${cleanRecipient}.wraith" not found` };
  } else {
    return { status: "error", detail: "Invalid recipient. Use a meta-address or .wraith name." };
  }

  const decoded = decodeStealthMetaAddress(metaAddress);
  const { stealthAddress, ephemeralPubKey, viewTag } = generateStealthAddress(
    decoded.spendingPubKey,
    decoded.viewingPubKey
  );

  const viewTagHex = viewTag.toString(16).padStart(2, "0");
  const metadata = `0x${viewTagHex}` as Hex;

  let txHash: string;

  try {
    if (asset === "ETH" || !TOKENS[asset] || TOKENS[asset].address === "native") {
      txHash = await walletClient.writeContract({
        address: WRAITH_SENDER_ADDRESS,
        abi: WRAITH_SENDER_ABI,
        functionName: "sendETH",
        args: [SCHEME_ID, stealthAddress as Hex, ephemeralPubKey as Hex, metadata],
        value: parseEther(amount),
      });
    } else {
      const token = TOKENS[asset];
      const parsedAmount = parseUnits(amount, token.decimals);

      await walletClient.writeContract({
        address: token.address as Hex,
        abi: erc20Abi,
        functionName: "approve",
        args: [WRAITH_SENDER_ADDRESS, parsedAmount],
      });

      txHash = await walletClient.writeContract({
        address: WRAITH_SENDER_ADDRESS,
        abi: WRAITH_SENDER_ABI,
        functionName: "sendERC20",
        args: [token.address as Hex, parsedAmount, SCHEME_ID, stealthAddress as Hex, ephemeralPubKey as Hex, metadata],
      });
    }
  } catch (err: any) {
    return { status: "error", detail: cleanError(err) };
  }

  createNotification(agentId, "payment_sent", "Payment Sent", `Sent ${amount} ${asset} to stealth address ${(stealthAddress as string).slice(0, 10)}...`);

  return {
    status: "success",
    detail: `Sent ${amount} ${asset} to ${recipient.includes(".wraith") || /^[a-z0-9]+$/.test(cleanRecipient) ? cleanRecipient + ".wraith" : "stealth address"}.\nStealth address: ${stealthAddress}\nTx: ${txUrl(txHash)}`,
  };
}

async function toolScanPayments(agentId: string): Promise<{ status: string; detail: string }> {
  const secret = getAgentSecret(agentId);
  const stealthKeys = await deriveAgentStealthKeys(secret);

  const announcements = await fetchAllAnnouncements();
  const matched = scanAnnouncements(
    announcements,
    stealthKeys.viewingKey,
    stealthKeys.spendingPubKey,
    stealthKeys.spendingKey
  );

  if (matched.length === 0) {
    return { status: "success", detail: `Scanned ${announcements.length} announcements. No incoming stealth payments found.` };
  }

  const lines: string[] = [`Found ${matched.length} incoming stealth payment(s):\n`];

  for (let i = 0; i < matched.length; i++) {
    const m = matched[i];
    const balances = await getBalances(m.stealthAddress as Hex);
    const balStr = balances.map(b => `${b.balance} ${b.asset}`).join(", ") || "empty";
    lines.push(`${i + 1}. Address: ${m.stealthAddress}\n   Balance: ${balStr}`);
  }

  return { status: "success", detail: lines.join("\n") };
}

async function toolGetBalance(agentId: string): Promise<{ status: string; detail: string }> {
  const agent = getAgent(agentId);
  if (!agent) return { status: "error", detail: "Agent not found" };

  const balances = await getBalances(agent.address as Hex);
  const lines = balances.map(b => `${b.asset}: ${b.balance}`);

  return { status: "success", detail: `Wallet balance:\n${lines.join("\n")}` };
}

async function toolResolveName(name: string): Promise<{ status: string; detail: string }> {
  const cleanName = name.replace(/\.wraith$/i, "").toLowerCase();
  const metaAddress = await resolveWraithName(cleanName);

  if (!metaAddress) {
    return { status: "error", detail: `Name "${cleanName}.wraith" is not registered.` };
  }

  return { status: "success", detail: `${cleanName}.wraith resolves to:\n${metaAddress}` };
}

async function toolRegisterName(agentId: string, name: string): Promise<{ status: string; detail: string }> {
  const agent = getAgent(agentId);
  if (!agent) return { status: "error", detail: "Agent not found" };

  const cleanName = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  const secret = getAgentSecret(agentId);
  const stealthKeys = await deriveAgentStealthKeys(secret);
  const metaBytes = metaAddressToBytes(agent.metaAddress);
  const sig = signNameRegistrationOnBehalf(cleanName, metaBytes, stealthKeys.spendingKey, 0n);

  const res = await fetch(`${RELAYER_URL}/register-name`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: cleanName, stealthMetaAddress: metaBytes, signature: sig }),
  });

  if (!res.ok) {
    const data = (await res.json()) as { error?: string };
    return { status: "error", detail: `Registration failed: ${data.error}` };
  }

  return { status: "success", detail: `Registered ${cleanName}.wraith` };
}

async function toolGetAgentInfo(agentId: string, clientOrigin: string): Promise<{ status: string; detail: string }> {
  const agent = getAgent(agentId);
  if (!agent) return { status: "error", detail: "Agent not found" };

  const balances = await getBalances(agent.address as Hex);
  const balStr = balances.map(b => `${b.balance} ${b.asset}`).join(", ") || "0 ETH";

  return {
    status: "success",
    detail: [
      `**${agent.name}.wraith**`,
      ``,
      `Network: Horizen Testnet`,
      `Address: ${agent.address}`,
      `Meta-address: ${agent.metaAddress}`,
      `Balance: ${balStr}`,
      ``,
      `Explorer: ${addressUrl(agent.address)}`,
      `Pay me: ${clientOrigin}/pay/${agent.name}`,
    ].join("\n"),
  };
}

async function toolWithdraw(
  agentId: string,
  destination: string,
  index?: number
): Promise<{ status: string; detail: string }> {
  const secret = getAgentSecret(agentId);
  const stealthKeys = await deriveAgentStealthKeys(secret);

  const announcements = await fetchAllAnnouncements();
  const matched = scanAnnouncements(
    announcements,
    stealthKeys.viewingKey,
    stealthKeys.spendingPubKey,
    stealthKeys.spendingKey
  );

  if (matched.length === 0) {
    return { status: "error", detail: "No stealth addresses found to withdraw from." };
  }

  const idx = index !== undefined ? index : 0;
  if (idx < 0 || idx >= matched.length) {
    return { status: "error", detail: `Invalid index. You have ${matched.length} stealth address(es).` };
  }

  const m = matched[idx];
  const stealthPrivKey = deriveStealthPrivateKey(
    stealthKeys.spendingKey,
    m.ephemeralPubKey,
    stealthKeys.viewingKey
  );

  const stealthAccount = privateKeyToAccount(stealthPrivKey as Hex);
  const stealthWallet = createWalletClient({ account: stealthAccount, chain, transport: http(RPC_URL) });

  const balance = await publicClient.getBalance({ address: stealthAccount.address });
  if (balance === 0n) return { status: "error", detail: "Stealth address has zero balance." };

  const gasPrice = await publicClient.getGasPrice();
  const gasCost = gasPrice * 21000n * 150n / 100n;
  const sendable = balance - gasCost;

  if (sendable <= 0n) return { status: "error", detail: "Balance too low to cover gas." };

  const txHash = await stealthWallet.sendTransaction({
    to: destination as Hex,
    value: sendable,
  });

  createNotification(agentId, "withdrawal", "Withdrawal", `Withdrew ${formatEther(sendable)} ETH from stealth address to ${destination.slice(0, 10)}...`);

  return {
    status: "success",
    detail: `Withdrew ${formatEther(sendable)} ETH from ${m.stealthAddress}\nTo: ${destination}\nTx: ${txUrl(txHash)}`,
  };
}

async function toolWithdrawAll(
  agentId: string,
  destination: string
): Promise<{ status: string; detail: string }> {
  const secret = getAgentSecret(agentId);
  const stealthKeys = await deriveAgentStealthKeys(secret);

  const announcements = await fetchAllAnnouncements();
  const matched = scanAnnouncements(
    announcements,
    stealthKeys.viewingKey,
    stealthKeys.spendingPubKey,
    stealthKeys.spendingKey
  );

  if (matched.length === 0) {
    return { status: "error", detail: "No stealth addresses found." };
  }

  let success = 0;
  let failed = 0;
  const lines: string[] = [];

  for (const m of matched) {
    try {
      const stealthPrivKey = deriveStealthPrivateKey(
        stealthKeys.spendingKey,
        m.ephemeralPubKey,
        stealthKeys.viewingKey
      );
      const stealthAccount = privateKeyToAccount(stealthPrivKey as Hex);
      const stealthWallet = createWalletClient({ account: stealthAccount, chain, transport: http(RPC_URL) });

      const balance = await publicClient.getBalance({ address: stealthAccount.address });
      if (balance === 0n) { failed++; continue; }

      const gasPrice = await publicClient.getGasPrice();
      const gasCost = gasPrice * 21000n * 150n / 100n;
      const sendable = balance - gasCost;
      if (sendable <= 0n) { failed++; continue; }

      const txHash = await stealthWallet.sendTransaction({
        to: destination as Hex,
        value: sendable,
      });

      lines.push(`${formatEther(sendable)} ETH from ${(m.stealthAddress as string).slice(0, 10)}... → ${txUrl(txHash)}`);
      success++;
    } catch {
      failed++;
    }
  }

  createNotification(agentId, "withdrawal", "Batch Withdrawal", `Withdrew from ${success} stealth address(es) to ${destination.slice(0, 10)}...`);

  return {
    status: "success",
    detail: `Withdrew from ${success}/${matched.length} stealth addresses.\n${lines.join("\n")}${failed > 0 ? `\n${failed} failed (empty or insufficient gas).` : ""}`,
  };
}

async function toolCreateInvoice(
  agentId: string,
  amount: string,
  memo: string,
  clientOrigin: string
): Promise<{ status: string; detail: string }> {
  const agent = getAgent(agentId);
  if (!agent) return { status: "error", detail: "Agent not found" };

  const invoiceId = randomUUID();
  db.prepare(
    "INSERT INTO invoices (id, agent_id, amount, memo) VALUES (?, ?, ?, ?)"
  ).run(invoiceId, agentId, amount, memo);

  const payUrl = `${clientOrigin}/pay/invoice/${invoiceId}`;

  return {
    status: "success",
    detail: JSON.stringify({
      invoiceId,
      payTo: `${agent.name}.wraith`,
      amount,
      memo,
      status: "pending",
      paymentLink: payUrl,
      markdownLink: `[Pay ${amount} ETH →](${payUrl})`,
    }),
  };
}

async function toolCheckInvoices(agentId: string, clientOrigin: string): Promise<{ status: string; detail: string }> {
  const allInvoices = db.prepare(
    "SELECT id, amount, memo, status, tx_hash, created_at FROM invoices WHERE agent_id = ? ORDER BY created_at DESC"
  ).all(agentId) as any[];

  if (allInvoices.length === 0) {
    return { status: "success", detail: "No invoices found." };
  }

  const pendingCount = allInvoices.filter((i: any) => i.status === "pending").length;
  const paidCount = allInvoices.filter((i: any) => i.status === "paid").length;

  return {
    status: "success",
    detail: JSON.stringify({
      summary: { total: allInvoices.length, pending: pendingCount, paid: paidCount },
      invoices: allInvoices.map((i: any) => ({
        id: i.id,
        amount: i.amount,
        memo: i.memo,
        status: i.status,
        txHash: i.tx_hash || null,
        txLink: i.tx_hash ? txUrl(i.tx_hash) : null,
        payLink: i.status === "pending" ? `[Pay ${i.amount} ETH →](${clientOrigin}/pay/invoice/${i.id})` : null,
        createdAt: i.created_at,
      })),
    }),
  };
}

async function toolFundWallet(agentId: string): Promise<{ status: string; detail: string }> {
  const agent = getAgent(agentId);
  if (!agent) return { status: "error", detail: "Agent not found" };

  try {
    const deployerAccount = privateKeyToAccount(DEPLOYER_KEY);
    const deployerClient = createWalletClient({ account: deployerAccount, chain, transport: http(RPC_URL) });

    const txHash = await deployerClient.sendTransaction({
      to: agent.address as Hex,
      value: parseEther("0.01"),
    });

    return {
      status: "success",
      detail: `Funded wallet with 0.01 ETH.\nTx: ${txUrl(txHash)}`,
    };
  } catch (err: any) {
    return { status: "error", detail: `Funding failed: ${err.message}` };
  }
}

async function toolPrivacyCheck(agentId: string): Promise<{ status: string; detail: string }> {
  const secret = getAgentSecret(agentId);
  const stealthKeys = await deriveAgentStealthKeys(secret);

  const announcements = await fetchAllAnnouncements();
  const matched = scanAnnouncements(
    announcements,
    stealthKeys.viewingKey,
    stealthKeys.spendingPubKey,
    stealthKeys.spendingKey
  );

  const issues: Array<{ severity: string; issue: string; recommendation: string }> = [];
  let privacyScore = 100;

  if (matched.length > 0) {
    // Fetch balances for all matched addresses
    const balances: number[] = [];
    const dustAddrs: string[] = [];
    const activeAddrs: string[] = [];

    for (const m of matched) {
      const bal = await publicClient.getBalance({ address: m.stealthAddress as Hex });
      const ethBal = Number(formatEther(bal));
      if (ethBal > 0) {
        balances.push(ethBal);
        if (ethBal < 0.0001) {
          dustAddrs.push(m.stealthAddress as string);
        } else {
          activeAddrs.push(m.stealthAddress as string);
        }
      }
    }

    // Dust analysis
    if (dustAddrs.length > 0) {
      issues.push({
        severity: "low",
        issue: `${dustAddrs.length} address(es) with dust balances (<0.0001 ETH)`,
        recommendation: "Ignore dust addresses — withdrawing them costs more in gas than they're worth and creates unnecessary on-chain activity.",
      });
      privacyScore -= 5;
    }

    // Balance amount correlation
    const nonDustBalances = balances.filter(b => b >= 0.0001);
    if (nonDustBalances.length > 2) {
      const uniqueRounded = new Set(nonDustBalances.map(b => b.toFixed(4)));
      if (uniqueRounded.size < nonDustBalances.length * 0.5) {
        issues.push({
          severity: "medium",
          issue: "Multiple stealth addresses have similar balances",
          recommendation: "Identical amounts across stealth addresses can be correlated by observers. Request senders to vary amounts slightly.",
        });
        privacyScore -= 15;
      }
    }

    // Too many active addresses
    if (activeAddrs.length > 5) {
      issues.push({
        severity: "medium",
        issue: `${activeAddrs.length} unspent stealth addresses accumulating`,
        recommendation: "Large numbers of unspent addresses can be linked through timing analysis. Withdraw periodically using different destination addresses with time delays.",
      });
      privacyScore -= 10;
    }

    // Large single balance
    const largeBalance = nonDustBalances.find(b => b > 1);
    if (largeBalance) {
      issues.push({
        severity: "high",
        issue: `High-value stealth address detected (${largeBalance.toFixed(4)} ETH)`,
        recommendation: "Large balances in stealth addresses are attractive targets. Consider splitting into smaller amounts across multiple withdrawals to different addresses.",
      });
      privacyScore -= 10;
    }
  }

  // Agent wallet balance check
  const agent = getAgent(agentId);
  if (agent) {
    const mainBal = await publicClient.getBalance({ address: agent.address as Hex });
    if (mainBal < parseEther("0.005")) {
      issues.push({
        severity: "low",
        issue: "Low main wallet balance",
        recommendation: "May not have enough gas for future transactions. Fund the wallet.",
      });
      privacyScore -= 5;
    }

    // Connected wallet warning
    const row = db.prepare("SELECT owner_wallet FROM agents WHERE id = ?").get(agentId) as any;
    if (row?.owner_wallet) {
      issues.push({
        severity: "info",
        issue: "Connected wallet is public on-chain",
        recommendation: `Your connected wallet (${row.owner_wallet.slice(0, 10)}...) is visible. Never withdraw stealth funds directly to this address — it links your agent to your identity.`,
      });
    }
  }

  if (issues.length === 0) {
    issues.push({
      severity: "info",
      issue: "No privacy issues detected",
      recommendation: "Continue using unique stealth addresses for each transaction. Space out withdrawals and use fresh destination addresses.",
    });
  }

  privacyScore = Math.max(0, Math.min(100, privacyScore));

  return {
    status: "success",
    detail: JSON.stringify({
      privacyScore,
      rating: privacyScore >= 80 ? "Good" : privacyScore >= 50 ? "Fair" : "Poor",
      addressCount: matched.length,
      totalBalance: matched.length > 0
        ? (await Promise.all(matched.map(m => publicClient.getBalance({ address: m.stealthAddress as Hex }))))
            .reduce((acc, b) => acc + Number(formatEther(b)), 0).toFixed(4) + " ETH"
        : "0 ETH",
      issues,
      bestPractices: [
        "Use a fresh destination address for each withdrawal",
        "Space withdrawals at least 1 hour apart",
        "Never withdraw to your connected wallet address",
        "Vary payment amounts to avoid correlation",
        "Use intermediate addresses when consolidating large sums",
      ],
    }),
  };
}

// Scheduled payments

function parseCronInterval(cron: string): number {
  const lower = cron.toLowerCase().trim();
  if (lower.includes("minute")) return 60;
  if (lower.includes("hour")) return 3600;
  if (lower.includes("day") || lower.includes("daily")) return 86400;
  if (lower.includes("week")) return 604800;
  if (lower.includes("month")) return 2592000;
  return 86400;
}

async function toolSchedulePayment(
  agentId: string,
  recipient: string,
  amount: string,
  asset: string,
  schedule: string,
  memo?: string,
  endsAt?: string
): Promise<{ status: string; detail: string }> {
  const intervalSec = parseCronInterval(schedule);
  const nextRun = Math.floor(Date.now() / 1000) + intervalSec;

  let endsAtUnix: number | null = null;
  if (endsAt) {
    const d = new Date(endsAt);
    if (!isNaN(d.getTime())) endsAtUnix = Math.floor(d.getTime() / 1000);
  }

  const id = randomUUID();
  db.prepare(
    "INSERT INTO scheduled_payments (id, agent_id, recipient, amount, asset, memo, cron, next_run, ends_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(id, agentId, recipient, amount, asset || "ETH", memo || null, schedule, nextRun, endsAtUnix);

  const endsStr = endsAtUnix ? `\nEnds: ${formatHumanDate(endsAtUnix)}` : "";

  return {
    status: "success",
    detail: `Scheduled: ${amount} ${asset || "ETH"} to ${recipient} ${schedule}.\nNext run: ${formatHumanDate(nextRun)}${endsStr}\nID: ${id}`,
  };
}

async function toolListSchedules(agentId: string): Promise<{ status: string; detail: string }> {
  const rows = db.prepare(
    "SELECT * FROM scheduled_payments WHERE agent_id = ? AND status = 'active' ORDER BY next_run ASC"
  ).all(agentId) as any[];

  if (rows.length === 0) return { status: "success", detail: "No active scheduled payments." };

  const lines = rows.map((r: any, i: number) => {
    const endsStr = r.ends_at ? ` | Ends: ${formatHumanDate(r.ends_at)}` : "";
    return `${i + 1}. ${r.amount} ${r.asset} → ${r.recipient} (${r.cron})\n   Next: ${formatHumanDate(r.next_run)}${endsStr}\n   ID: ${r.id}`;
  });

  return { status: "success", detail: `Scheduled payments:\n${lines.join("\n")}` };
}

async function toolManageSchedule(
  scheduleId: string,
  action: string
): Promise<{ status: string; detail: string }> {
  if (action === "cancel" || action === "pause") {
    db.prepare("UPDATE scheduled_payments SET status = 'paused' WHERE id = ?").run(scheduleId);
    return { status: "success", detail: `Schedule ${scheduleId.slice(0, 8)}... paused.` };
  }
  if (action === "resume") {
    db.prepare("UPDATE scheduled_payments SET status = 'active' WHERE id = ?").run(scheduleId);
    return { status: "success", detail: `Schedule ${scheduleId.slice(0, 8)}... resumed.` };
  }
  if (action === "delete") {
    db.prepare("DELETE FROM scheduled_payments WHERE id = ?").run(scheduleId);
    return { status: "success", detail: `Schedule ${scheduleId.slice(0, 8)}... deleted.` };
  }
  return { status: "error", detail: `Unknown action: ${action}` };
}

export async function executeScheduledPayments() {
  const now = Math.floor(Date.now() / 1000);
  const due = db.prepare(
    "SELECT * FROM scheduled_payments WHERE status = 'active' AND next_run <= ?"
  ).all(now) as any[];

  for (const row of due) {
    // Check if expired
    if (row.ends_at && now > row.ends_at) {
      db.prepare("UPDATE scheduled_payments SET status = 'completed' WHERE id = ?").run(row.id);
      createNotification(row.agent_id, "schedule", "Schedule Completed", `Recurring payment to ${row.recipient} has ended.`);
      continue;
    }

    try {
      const result = await toolSendPayment(row.agent_id, row.recipient, row.amount, row.asset);
      if (result.status === "success") {
        const interval = parseCronInterval(row.cron);
        db.prepare("UPDATE scheduled_payments SET last_run = ?, next_run = ? WHERE id = ?")
          .run(now, now + interval, row.id);
        createNotification(row.agent_id, "schedule", "Scheduled Payment Sent",
          `Sent ${row.amount} ${row.asset} to ${row.recipient}. Next: ${formatHumanDate(now + interval)}`);
      } else {
        createNotification(row.agent_id, "schedule_error", "Scheduled Payment Failed",
          `Failed to send ${row.amount} ${row.asset} to ${row.recipient}: ${result.detail}`);
      }
    } catch (err: any) {
      createNotification(row.agent_id, "schedule_error", "Scheduled Payment Error", err.message);
    }
  }
}

// ---------------------------------------------------------------------------
// Gemini AI chat
// ---------------------------------------------------------------------------

const TOOL_DECLARATIONS = [
  {
    name: "send_payment",
    description: "Send ETH or ERC-20 tokens (ZEN, USDC) privately to a .wraith name or stealth meta-address via the WraithSender contract. Transfer and announcement happen atomically.",
    parameters: {
      type: "object",
      properties: {
        recipient: { type: "string", description: ".wraith name (e.g. 'alice' or 'alice.wraith') or stealth meta-address (st:eth:0x...)" },
        amount: { type: "string", description: "Amount to send (e.g. '0.01')" },
        asset: { type: "string", description: "Asset to send: ETH, ZEN, or USDC. Default: ETH", enum: ["ETH", "ZEN", "USDC"] },
      },
      required: ["recipient", "amount"],
    },
  },
  {
    name: "pay_agent",
    description: "Pay another Wraith agent privately by their .wraith name.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Agent's .wraith name" },
        amount: { type: "string", description: "Amount to send" },
        asset: { type: "string", description: "Asset: ETH, ZEN, or USDC", enum: ["ETH", "ZEN", "USDC"] },
      },
      required: ["name", "amount"],
    },
  },
  {
    name: "scan_payments",
    description: "Scan the blockchain for incoming stealth payments to this agent using the Goldsky subgraph.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "get_balance",
    description: "Check the agent's wallet balance (ETH + ERC-20 tokens).",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "create_invoice",
    description: "Create a payment invoice. Always include the markdownLink from the response in your reply exactly as-is so users can click it.",
    parameters: {
      type: "object",
      properties: {
        amount: { type: "string", description: "Invoice amount in ETH" },
        memo: { type: "string", description: "Invoice memo/description" },
      },
      required: ["amount", "memo"],
    },
  },
  {
    name: "check_invoices",
    description: "List all invoices and their payment status.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "withdraw",
    description: "Withdraw ETH from a specific stealth address to a destination address.",
    parameters: {
      type: "object",
      properties: {
        destination: { type: "string", description: "Destination 0x address" },
        index: { type: "number", description: "Index of the stealth address (from scan results). Default: 0" },
      },
      required: ["destination"],
    },
  },
  {
    name: "withdraw_all",
    description: "Withdraw ETH from ALL stealth addresses to one destination.",
    parameters: {
      type: "object",
      properties: {
        destination: { type: "string", description: "Destination 0x address" },
      },
      required: ["destination"],
    },
  },
  {
    name: "register_name",
    description: "Register a .wraith name for this agent (sponsored via relayer).",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Name to register (lowercase alphanumeric, 3-32 chars)" },
      },
      required: ["name"],
    },
  },
  {
    name: "resolve_name",
    description: "Look up a .wraith name to get the stealth meta-address.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: ".wraith name to look up" },
      },
      required: ["name"],
    },
  },
  {
    name: "get_agent_info",
    description: "Get this agent's identity card: name, address, meta-address, balance, explorer link.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "fund_wallet",
    description: "Fund the agent's wallet with testnet ETH from the server's deployer wallet.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "privacy_check",
    description: "Analyze the agent's stealth addresses for privacy issues: dust balances, funded count, gas levels.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "schedule_payment",
    description: "Schedule a recurring payment to a .wraith name or meta-address.",
    parameters: {
      type: "object",
      properties: {
        recipient: { type: "string", description: ".wraith name or meta-address" },
        amount: { type: "string", description: "Amount per payment" },
        asset: { type: "string", description: "Asset: ETH, ZEN, or USDC", enum: ["ETH", "ZEN", "USDC"] },
        schedule: { type: "string", description: "Frequency: 'every minute', 'every hour', 'every day', 'every week', 'every month'" },
        memo: { type: "string", description: "Optional memo" },
        ends_at: { type: "string", description: "Optional end date (ISO format)" },
      },
      required: ["recipient", "amount", "schedule"],
    },
  },
  {
    name: "list_schedules",
    description: "List all active scheduled payments.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "manage_schedule",
    description: "Pause, resume, or delete a scheduled payment.",
    parameters: {
      type: "object",
      properties: {
        schedule_id: { type: "string", description: "Schedule ID" },
        action: { type: "string", description: "Action: cancel, resume, or delete", enum: ["cancel", "resume", "delete"] },
      },
      required: ["schedule_id", "action"],
    },
  },
];

export async function chat(
  agentId: string,
  message: string,
  history: { role: string; text: string }[],
  clientOrigin: string
): Promise<{ response: string; toolCalls?: { name: string; status: string; detail: string }[] }> {
  const agent = getAgent(agentId);
  if (!agent) throw new Error("Agent not found");

  if (!GEMINI_API_KEY) {
    return { response: "Gemini API key not configured. Set GEMINI_API_KEY in .env." };
  }

  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction: [
      `You are "${agent.name}.wraith", an AI agent on the Horizen blockchain with stealth address capabilities.`,
      `Your Horizen address: ${agent.address}`,
      `Your stealth meta-address: ${agent.metaAddress}`,
      `Network: Horizen Testnet (chain ID ${CHAIN_ID})`,
      `Explorer: ${EXPLORER_URL}`,
      ``,
      `You can send and receive ETH, ZEN, and USDC privately using stealth addresses.`,
      `All payments go through the WraithSender contract which atomically transfers funds and publishes an announcement.`,
      `You can also create invoices, schedule recurring payments, check your balance, scan for incoming payments, and manage your .wraith name.`,
      ``,
      `When users ask to send money, always use the send_payment tool.`,
      `When users ask about their balance, use get_balance.`,
      `When users ask about incoming payments, use scan_payments.`,
      `When users ask about their identity, use get_agent_info.`,
      ``,
      `When users ask to send money, always use the send_payment tool.`,
      `When users ask about their balance, use get_balance.`,
      `When users ask about incoming payments, use scan_payments.`,
      `When users ask about their identity, use get_agent_info.`,
      ``,
      `FORMATTING RULES:`,
      `- Always use markdown for structured data. Use **bold** for labels, code blocks for addresses/keys, and tables or lists where appropriate.`,
      `- When a tool result includes a transaction link, ALWAYS show it as a clickable markdown link like [View Transaction](url). Never show raw hashes.`,
      `- When showing invoice payment links, ALWAYS format as a clickable markdown link like [Pay 0.01 ETH →](url). Never show raw URLs.`,
      `- For agent info, format cleanly with bold labels and code blocks for addresses.`,
      `- Keep responses concise but well-formatted. Use line breaks between sections.`,
      `- When there's an error like insufficient funds, just say "Insufficient balance" briefly. Do NOT show technical error details, stack traces, or contract call data.`,
      `Default asset is ETH unless the user specifies otherwise.`,
    ].join("\n"),
    tools: [{ functionDeclarations: TOOL_DECLARATIONS as any }],
  });

  const chatHistory = history.map(h => ({
    role: h.role === "agent" ? "model" : "user",
    parts: [{ text: h.text }],
  }));

  const chatSession = model.startChat({ history: chatHistory as any });
  const result = await chatSession.sendMessage(message);
  const response = result.response;

  const toolCalls: { name: string; status: string; detail: string }[] = [];

  // Check for function calls
  const candidates = response.candidates;
  if (candidates && candidates.length > 0) {
    const parts = candidates[0].content?.parts ?? [];

    for (const part of parts) {
      if (part.functionCall) {
        const fc = part.functionCall;
        const args = fc.args as Record<string, any>;
        let toolResult: { status: string; detail: string };

        try {
          switch (fc.name) {
            case "send_payment":
              toolResult = await toolSendPayment(agentId, args.recipient, args.amount, args.asset || "ETH");
              break;
            case "pay_agent":
              toolResult = await toolSendPayment(agentId, args.name, args.amount, args.asset || "ETH");
              break;
            case "scan_payments":
              toolResult = await toolScanPayments(agentId);
              break;
            case "get_balance":
              toolResult = await toolGetBalance(agentId);
              break;
            case "create_invoice":
              toolResult = await toolCreateInvoice(agentId, args.amount, args.memo, clientOrigin);
              break;
            case "check_invoices":
              toolResult = await toolCheckInvoices(agentId, clientOrigin);
              break;
            case "withdraw":
              toolResult = await toolWithdraw(agentId, args.destination, args.index);
              break;
            case "withdraw_all":
              toolResult = await toolWithdrawAll(agentId, args.destination);
              break;
            case "register_name":
              toolResult = await toolRegisterName(agentId, args.name);
              break;
            case "resolve_name":
              toolResult = await toolResolveName(args.name);
              break;
            case "get_agent_info":
              toolResult = await toolGetAgentInfo(agentId, clientOrigin);
              break;
            case "fund_wallet":
              toolResult = await toolFundWallet(agentId);
              break;
            case "privacy_check":
              toolResult = await toolPrivacyCheck(agentId);
              break;
            case "schedule_payment":
              toolResult = await toolSchedulePayment(agentId, args.recipient, args.amount, args.asset || "ETH", args.schedule, args.memo, args.ends_at);
              break;
            case "list_schedules":
              toolResult = await toolListSchedules(agentId);
              break;
            case "manage_schedule":
              toolResult = await toolManageSchedule(args.schedule_id, args.action);
              break;
            default:
              toolResult = { status: "error", detail: `Unknown tool: ${fc.name}` };
          }
        } catch (err: any) {
          toolResult = { status: "error", detail: err.message || "Tool execution failed" };
        }

        toolCalls.push({ name: fc.name, ...toolResult });

        // Send the tool result back to Gemini for a natural language response
        let responseData: any;
        try {
          responseData = JSON.parse(toolResult.detail);
        } catch {
          responseData = { result: toolResult.detail };
        }

        const followUp = await chatSession.sendMessage([
          {
            functionResponse: {
              name: fc.name,
              response: { status: toolResult.status, ...responseData },
            },
          },
        ]);

        const followUpText = followUp.response.text();
        if (followUpText) {
          return { response: followUpText, toolCalls };
        }
      }
    }

    // If there were no function calls, return the text response
    const textResponse = response.text();
    return { response: textResponse, toolCalls: toolCalls.length > 0 ? toolCalls : undefined };
  }

  return { response: response.text() };
}

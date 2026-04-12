import { useState, useEffect } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { QRCodeCanvas } from "qrcode.react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { parseEther } from "viem";
import {
  decodeStealthMetaAddress,
  generateStealthAddress,
  SCHEME_ID,
} from "@wraith-horizen/sdk";
import type { HexString } from "@wraith-horizen/sdk";
import { WRAITH_SENDER_ABI, WRAITH_SENDER_ADDRESS, EXPLORER_URL } from "../config";

const LS_SERVER_URL = "wraith_server_url";
const DEFAULT_SERVER_URL = "http://localhost:3002";

interface AgentPublicInfo {
  name: string;
  metaAddress: string;
  address: string;
}

function truncateKey(key: string, len = 8): string {
  if (key.length <= len * 2 + 3) return key;
  return `${key.slice(0, len)}...${key.slice(-len)}`;
}

export default function Pay() {
  const { name } = useParams<{ name: string }>();
  const [searchParams] = useSearchParams();
  const urlAmount = searchParams.get("amount") || "";
  const memo = searchParams.get("memo") || "";
  const [amountInput, setAmountInput] = useState(urlAmount);
  const amount = amountInput;

  const serverUrl = localStorage.getItem(LS_SERVER_URL) || DEFAULT_SERVER_URL;

  const [agentInfo, setAgentInfo] = useState<AgentPublicInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [payStatus, setPayStatus] = useState<string | null>(null);

  const { isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { writeContract, data: txHash, isPending } = useWriteContract();
  const { isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  useEffect(() => {
    if (!name) {
      setError("No agent name specified");
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function fetchInfo() {
      try {
        const res = await fetch(`${serverUrl}/agent/info/${name}`);
        if (!res.ok) throw new Error(`Agent "${name}" not found`);
        const data = await res.json();
        if (cancelled) return;
        setAgentInfo({ name: data.name, metaAddress: data.metaAddress, address: data.address });
      } catch (e: unknown) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load agent");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchInfo();
    return () => { cancelled = true; };
  }, [name, serverUrl]);

  function handlePay() {
    if (!isConnected) { openConnectModal?.(); return; }
    if (!agentInfo || !amount) return;
    setPayStatus("Generating stealth address...");
    setError(null);
    try {
      const decoded = decodeStealthMetaAddress(agentInfo.metaAddress);
      const stealth = generateStealthAddress(decoded.spendingPubKey, decoded.viewingPubKey);
      const viewTagHex = stealth.viewTag.toString(16).padStart(2, "0");
      setPayStatus("Confirm in wallet...");
      writeContract({
        address: WRAITH_SENDER_ADDRESS as `0x${string}`,
        abi: WRAITH_SENDER_ABI,
        functionName: "sendETH",
        args: [SCHEME_ID, stealth.stealthAddress as `0x${string}`, stealth.ephemeralPubKey as `0x${string}`, `0x${viewTagHex}` as `0x${string}`],
        value: parseEther(amount),
      });
    } catch (e: any) {
      setError(e.message || "Payment failed");
      setPayStatus(null);
    }
  }

  function handleCopy(text: string, label: string) {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  }

  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#0e0e0e]">
        <div className="text-center">
          <img src="/logo.png" alt="Wraith" className="h-14 mx-auto mb-4 opacity-80" />
          <div className="flex items-center justify-center gap-1">
            <span className="inline-block h-1.5 w-1.5 bg-[#acabaa] animate-pulse-dots" style={{ animationDelay: "0s" }} />
            <span className="inline-block h-1.5 w-1.5 bg-[#acabaa] animate-pulse-dots" style={{ animationDelay: "0.2s" }} />
            <span className="inline-block h-1.5 w-1.5 bg-[#acabaa] animate-pulse-dots" style={{ animationDelay: "0.4s" }} />
          </div>
        </div>
      </div>
    );
  }

  if (!agentInfo) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#0e0e0e]">
        <div className="text-center max-w-md px-6">
          <img src="/logo.png" alt="Wraith" className="h-14 mx-auto mb-4 opacity-80" />
          <p className="text-[#acabaa] mb-4">{error || "Agent not found"}</p>
          <div className="flex gap-3 justify-center">
            <a href="/agents" className="text-xs text-[#767575] hover:text-[#acabaa] transition-colors">
              Browse agents
            </a>
            <a href="/" className="text-xs text-[#767575] hover:text-[#acabaa] transition-colors">
              Go home
            </a>
          </div>
        </div>
      </div>
    );
  }

  const pageUrl = window.location.href;
  return (
    <div className="flex h-screen w-screen flex-col bg-[#0e0e0e]">
      {/* Header */}
      <header className="flex-shrink-0 border-b border-[#252626]">
        <div className="flex items-center px-4 py-3">
          <a href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <img src="/logo.png" alt="Wraith" className="h-7 opacity-80" />
          </a>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-sm">
          {/* Agent card */}
          <div className="bg-[#131313] border border-[#252626]">
            {/* Card header */}
            <div className="bg-[#0a0a0a] px-6 py-5 text-center border-b border-[#252626]">
              <p
                className="text-2xl font-bold text-[#c6c6c7]"
                style={{ fontFamily: "Space Grotesk, monospace" }}
              >
                {agentInfo.name}.wraith
              </p>
              <div className="flex items-center justify-center gap-2 mt-2">
                <span className="h-2 w-2 bg-green-500" />
                <span className="text-xs text-[#767575]">Active on Horizen Testnet</span>
              </div>
            </div>

            {/* QR Code */}
            <div className="flex justify-center py-5">
              <div className="bg-[#0e0e0e] p-4">
                <QRCodeCanvas
                  value={pageUrl}
                  size={180}
                  bgColor="#0e0e0e"
                  fgColor="#c6c6c7"
                  level="H"
                />
              </div>
            </div>

            {/* Payment details */}
            <div className="px-6 pb-4 space-y-3">
              {amount && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[#767575]">Amount</span>
                  <span
                    className="text-sm text-[#c6c6c7] font-bold"
                    style={{ fontFamily: "Space Grotesk, monospace" }}
                  >
                    {amount} ETH
                  </span>
                </div>
              )}
              {memo && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[#767575]">Memo</span>
                  <span className="text-sm text-[#acabaa]">{memo}</span>
                </div>
              )}
              <div className="flex items-start justify-between gap-2">
                <span className="text-xs text-[#767575]">Address</span>
                <button
                  onClick={() => handleCopy(agentInfo.address, "address")}
                  className="text-xs text-[#acabaa] font-mono text-right hover:text-[#c6c6c7] transition-colors"
                >
                  {copied === "address" ? "Copied!" : truncateKey(agentInfo.address, 8)}
                </button>
              </div>
              <div className="flex items-start justify-between gap-2">
                <span className="text-xs text-[#767575] whitespace-nowrap">Meta Address</span>
                <button
                  onClick={() => handleCopy(agentInfo.metaAddress, "meta")}
                  className="text-xs text-[#acabaa] font-mono text-right hover:text-[#c6c6c7] transition-colors break-all"
                >
                  {copied === "meta" ? "Copied!" : truncateKey(agentInfo.metaAddress, 10)}
                </button>
              </div>
            </div>

            {/* Actions */}
            <div className="px-6 pb-6 space-y-2">
              {txHash && isSuccess ? (
                <div className="text-center space-y-2 py-2">
                  <p className="text-[#c6c6c7] font-bold" style={{ fontFamily: "Space Grotesk, monospace" }}>PAID</p>
                  <a href={`${EXPLORER_URL}/tx/${txHash}`} target="_blank" rel="noopener noreferrer" className="text-xs text-[#acabaa] underline hover:text-[#c6c6c7]">
                    View transaction
                  </a>
                </div>
              ) : (
                <>
                  {payStatus && <p className="text-xs text-[#acabaa] text-center mb-2">{payStatus}</p>}
                  {error && <p className="text-xs text-[#ee7d77] text-center mb-2">{error}</p>}

                  {!urlAmount && (
                    <div className="mb-3">
                      <input
                        type="text"
                        value={amountInput}
                        onChange={(e) => setAmountInput(e.target.value)}
                        placeholder="Amount (ETH)"
                        className="w-full bg-[#0a0a0a] border border-[#252626] px-4 py-3 text-sm text-[#c6c6c7] placeholder:text-[#484848] outline-none focus:border-[#484848] transition-colors"
                        style={{ fontFamily: "Space Grotesk, monospace" }}
                      />
                    </div>
                  )}

                  <button
                    onClick={handlePay}
                    disabled={isPending || !amount}
                    className="w-full py-3 bg-[#c6c6c7] text-[#0e0e0e] text-sm font-bold uppercase tracking-wider hover:bg-[#d4d4d5] transition-colors disabled:opacity-30"
                  >
                    {isPending ? "Processing..." : !isConnected ? "Connect Wallet & Pay" : amount ? `Pay ${amount} ETH` : "Enter amount"}
                  </button>
                </>
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => handleCopy(pageUrl, "link")}
                  className="flex-1 py-2.5 border border-[#484848] text-[#acabaa] text-xs font-bold uppercase tracking-wider hover:bg-[#1f2020] transition-colors"
                >
                  {copied === "link" ? "Copied!" : "Share Link"}
                </button>
                <a
                  href={`${EXPLORER_URL}/address/${agentInfo.address}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 py-2.5 border border-[#484848] text-[#acabaa] text-center text-xs font-bold uppercase tracking-wider hover:bg-[#1f2020] transition-colors"
                >
                  Explorer
                </a>
              </div>
            </div>
          </div>

          {/* Privacy note */}
          <p className="text-[10px] text-[#484848] text-center mt-4">
            Payment goes to a stealth address. Only {agentInfo.name}.wraith can detect it.
          </p>
        </div>
      </main>
    </div>
  );
}

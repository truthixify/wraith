import { useState } from "react";
import { useAccount, useChainId } from "wagmi";
import { WalletButton } from "@/components/connect-button";
import { isAddress } from "viem";
import {
  useSendStealth,
  TOKEN_LIST,
} from "@/hooks/useSendStealth";
import type { TokenOption } from "@/hooks/useSendStealth";
import { useLookupMetaAddress } from "@/hooks/useRegistry";
import { VaultStatus } from "@/components/vault-status";
import { META_ADDRESS_PREFIX } from "@wraith/sdk";
import { txUrl, addressUrl } from "@/lib/explorer";

function ExplorerLink({
  href,
  children,
}: {
  href: string | null;
  children: React.ReactNode;
}) {
  if (!href) return <>{children}</>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="hover:text-primary underline transition-colors"
    >
      {children}
    </a>
  );
}

export default function Send() {
  const { isConnected } = useAccount();
  const chainId = useChainId();

  const tokens = TOKEN_LIST[chainId] ?? TOKEN_LIST[31337] ?? [{ symbol: "ETH", address: "native" as const, decimals: 18 }];

  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [selectedToken, setSelectedToken] = useState<TokenOption>(tokens[0]);

  const isWalletAddress = isAddress(recipient);
  const isMetaAddress = recipient.startsWith(META_ADDRESS_PREFIX);

  const { data: lookedUpMeta } = useLookupMetaAddress(
    isWalletAddress ? (recipient as `0x${string}`) : undefined,
    chainId
  );

  const metaAddress = isMetaAddress
    ? recipient
    : lookedUpMeta
    ? `${META_ADDRESS_PREFIX}${(lookedUpMeta as string).slice(2)}`
    : "";

  const {
    generateAndSend,
    announce,
    reset,
    stealthResult,
    isTransferPending,
    isTransferConfirming,
    isTransferSuccess,
    isAnnouncePending,
    isAnnounceConfirming,
    isAnnounceSuccess,
    transferHash,
  } = useSendStealth(chainId);

  const handleNewTransfer = () => {
    reset();
    setRecipient("");
    setAmount("");
    setSelectedToken(tokens[0]);
  };

  if (!isConnected) {
    return (
      <>
        <VaultStatus />
        <header className="mb-16">
          <h1 className="font-headline text-4xl font-bold tracking-tighter uppercase text-primary">
            Initiate Transfer
          </h1>
          <p className="text-on-surface-variant text-sm mt-2 max-w-sm">
            Connect your wallet to send assets privately.
          </p>
        </header>
        <div className="flex justify-center">
          <WalletButton />
        </div>
      </>
    );
  }

  return (
    <>
      <VaultStatus />

      <section className="flex flex-col gap-12">
        <div>
          <h1 className="font-headline text-4xl font-bold tracking-tighter uppercase text-primary">
            Initiate Transfer
          </h1>
          <p className="text-on-surface-variant text-sm mt-2 max-w-sm">
            Send assets privately. All transactions use one-time stealth
            addresses.
          </p>
        </div>

        {!stealthResult && (
          <div className="flex flex-col gap-8">
            <div className="space-y-2">
              <label className="font-headline text-[10px] uppercase tracking-widest text-outline">
                Recipient Address / Meta-Address
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  placeholder="st:eth:0x... or 0x..."
                  className="w-full bg-surface-container-lowest border-none py-4 px-4 font-headline text-lg text-primary focus:ring-0 transition-colors"
                />
                {isWalletAddress && lookedUpMeta && (
                  <div className="absolute right-4 top-1/2 -translate-y-1/2">
                    <span className="font-headline text-[10px] text-primary uppercase bg-surface-container-high px-2 py-0.5">
                      Resolved
                    </span>
                  </div>
                )}
                {isMetaAddress && (
                  <div className="absolute right-4 top-1/2 -translate-y-1/2">
                    <span className="font-headline text-[10px] text-primary uppercase bg-surface-container-high px-2 py-0.5">
                      Meta-Address
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <label className="font-headline text-[10px] uppercase tracking-widest text-outline">
                Amount
              </label>
              <div className="flex bg-surface-container-lowest">
                <input
                  type="text"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="flex-1 bg-transparent border-none py-4 px-4 font-headline text-3xl text-primary focus:ring-0"
                />
                <select
                  value={selectedToken.symbol}
                  onChange={(e) => {
                    const t = tokens.find(
                      (tk) => tk.symbol === e.target.value
                    );
                    if (t) setSelectedToken(t);
                  }}
                  className="bg-surface-container-high border-none pl-5 pr-10 font-headline text-sm text-primary uppercase tracking-widest cursor-pointer focus:ring-0"
                >
                  {tokens.map((t) => (
                    <option key={t.symbol} value={t.symbol}>
                      {t.symbol}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="pt-4">
              <button
                onClick={() => {
                  if (metaAddress && amount)
                    generateAndSend(metaAddress, amount, selectedToken);
                }}
                disabled={!metaAddress || !amount || isTransferPending}
                className="w-full brushed-metal text-on-primary font-headline font-bold uppercase tracking-widest py-5 text-sm hover:brightness-110 transition-all active:scale-[0.99] disabled:opacity-30"
              >
                {isTransferPending
                  ? "Confirm in wallet..."
                  : "Execute Transfer"}
              </button>
            </div>
          </div>
        )}

        {stealthResult && (
          <div className="bg-surface-container-low p-6 space-y-6">
            <div className="flex flex-col gap-1">
              <span className="font-headline text-[10px] uppercase tracking-[0.2em] text-outline">
                Status Feed
              </span>
              <div className="h-px bg-outline-variant/20 w-full mt-2" />
            </div>

            <div className="space-y-4">
              <div className="flex items-start gap-4">
                <span className="text-primary mt-0.5 text-sm">
                  {isTransferSuccess ? "[+]" : "[~]"}
                </span>
                <div className="flex flex-col">
                  <span className="font-headline text-xs text-primary uppercase">
                    {isTransferConfirming
                      ? "Transfer Confirming..."
                      : isTransferSuccess
                      ? "Transfer Confirmed"
                      : "Transfer Pending"}
                  </span>
                  <span className="text-[10px] text-on-surface-variant font-body flex flex-wrap gap-x-2">
                    <span>
                      Stealth:{" "}
                      <ExplorerLink
                        href={addressUrl(
                          chainId,
                          stealthResult.stealthAddress
                        )}
                      >
                        {stealthResult.stealthAddress.slice(0, 14)}...
                      </ExplorerLink>
                    </span>
                    {transferHash && (
                      <span>
                        Tx:{" "}
                        <ExplorerLink href={txUrl(chainId, transferHash)}>
                          {transferHash.slice(0, 14)}...
                        </ExplorerLink>
                      </span>
                    )}
                  </span>
                </div>
              </div>

              <div
                className={`flex items-start gap-4 ${
                  !isTransferSuccess ? "opacity-30" : ""
                }`}
              >
                <span className="text-outline mt-0.5 text-sm">
                  {isAnnounceSuccess ? "[+]" : "[~]"}
                </span>
                <div className="flex flex-col">
                  <span className="font-headline text-xs text-on-surface uppercase">
                    {isAnnounceConfirming
                      ? "Publishing Announcement..."
                      : isAnnounceSuccess
                      ? "Announcement Published"
                      : "Announcement Broadcast"}
                  </span>
                  <span className="text-[10px] text-on-surface-variant font-body">
                    {isAnnounceSuccess
                      ? "Recipient can now find this transfer."
                      : "Publish so the recipient can discover this transfer."}
                  </span>
                </div>
              </div>

              {isTransferSuccess && !isAnnounceSuccess && (
                <button
                  onClick={announce}
                  disabled={isAnnouncePending || isAnnounceConfirming}
                  className="w-full py-4 border border-outline-variant text-primary font-headline font-bold uppercase tracking-[0.2em] text-sm hover:bg-surface-container-high transition-all disabled:opacity-30"
                >
                  {isAnnouncePending
                    ? "Confirm in wallet..."
                    : isAnnounceConfirming
                    ? "Confirming..."
                    : "Publish Announcement"}
                </button>
              )}

              {isAnnounceSuccess && (
                <button
                  onClick={handleNewTransfer}
                  className="w-full py-4 border border-outline-variant text-primary font-headline font-bold uppercase tracking-[0.2em] text-sm hover:bg-surface-container-high transition-all"
                >
                  New Transfer
                </button>
              )}
            </div>
          </div>
        )}
      </section>
    </>
  );
}

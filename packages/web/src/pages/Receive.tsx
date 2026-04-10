import { useState } from "react";
import { Link } from "react-router-dom";
import { useAccount, useChainId, useBalance } from "wagmi";
import { WalletButton } from "@/components/connect-button";
import { useScanAnnouncements } from "@/hooks/useScanAnnouncements";
import { useStealthKeysContext } from "@/context/stealth-keys";
import { VaultStatus } from "@/components/vault-status";
import { formatEther } from "viem";
import type { HexString } from "@wraith/sdk";
import { addressUrl } from "@/lib/explorer";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="text-[10px] font-headline uppercase tracking-widest text-outline hover:text-on-surface transition-colors"
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function StealthAddressRow({
  address,
  privateKey,
}: {
  address: HexString;
  privateKey: HexString;
}) {
  const chainId = useChainId();
  const { data: balance } = useBalance({ address, chainId });
  const [showKey, setShowKey] = useState(false);

  const url = addressUrl(chainId, address);

  return (
    <div className="bg-surface-container-low p-6 flex flex-col gap-6">
      <div className="flex justify-between items-start">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] text-outline uppercase tracking-widest font-headline">
            Stealth Address
          </span>
          {url ? (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="font-headline text-sm tracking-tight text-primary-dim truncate max-w-[280px] hover:text-primary underline transition-colors"
            >
              {address}
            </a>
          ) : (
            <span className="font-headline text-sm tracking-tight text-primary-dim truncate max-w-[280px]">
              {address}
            </span>
          )}
        </div>
        <div className="text-right">
          <span className="text-[10px] text-outline uppercase tracking-widest font-headline block mb-1">
            Balance
          </span>
          <span className="font-headline text-lg font-bold text-on-surface">
            {balance ? `${formatEther(balance.value)} ETH` : "..."}
          </span>
        </div>
      </div>

      {!showKey ? (
        <div className="bg-surface-container-lowest p-4 border border-outline-variant/10">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-headline uppercase tracking-widest text-outline">
              Private Key Hidden
            </span>
            <button
              onClick={() => setShowKey(true)}
              className="text-[10px] font-headline uppercase tracking-widest text-primary hover:text-primary-fixed underline transition-colors"
            >
              Reveal Key
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-error-container/5 p-4 border border-error-dim/20 relative overflow-hidden">
          <div
            className="absolute inset-0 opacity-[0.03] pointer-events-none"
            style={{
              backgroundImage:
                "radial-gradient(#bb5551 0.5px, transparent 0.5px)",
              backgroundSize: "10px 10px",
            }}
          />
          <div className="flex flex-col gap-2 relative z-10">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[9px] font-headline uppercase tracking-[0.2em] text-error-dim font-bold">
                Sensitive: Stealth Key
              </span>
              <CopyButton text={privateKey} />
            </div>
            <code className="font-headline text-[11px] break-all text-on-surface leading-tight tracking-normal">
              {privateKey}
            </code>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Receive() {
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const { keys } = useStealthKeysContext();
  const { scan, matched, isScanning } = useScanAnnouncements(chainId);

  if (!isConnected) {
    return (
      <>
        <VaultStatus />
        <header className="mb-20 text-center">
          <h1 className="font-headline text-5xl font-bold tracking-tighter uppercase mb-4 text-primary">
            Inbound Assets
          </h1>
          <p className="text-on-surface-variant text-sm max-w-sm mx-auto leading-relaxed">
            Connect your wallet to scan for incoming stealth transfers.
          </p>
        </header>
        <div className="flex justify-center">
          <WalletButton />
        </div>
      </>
    );
  }

  if (!keys) {
    return (
      <>
        <VaultStatus />
        <header className="mb-20 text-center">
          <h1 className="font-headline text-5xl font-bold tracking-tighter uppercase mb-4 text-primary">
            Inbound Assets
          </h1>
          <p className="text-on-surface-variant text-sm max-w-sm mx-auto leading-relaxed">
            You need to{" "}
            <Link to="/setup" className="text-primary underline">
              set up your stealth keys
            </Link>{" "}
            before scanning.
          </p>
        </header>
      </>
    );
  }

  return (
    <>
      <VaultStatus />

      <header className="mb-20 text-center">
        <h1 className="font-headline text-5xl font-bold tracking-tighter uppercase mb-4 text-primary">
          Inbound Assets
        </h1>
        <p className="text-on-surface-variant text-sm max-w-sm mx-auto leading-relaxed">
          Scan the blockchain to identify stealth addresses associated with your
          keypair.
        </p>
      </header>

      <div className="flex flex-col items-center mb-24">
        <button
          onClick={() =>
            scan(keys.viewingKey, keys.spendingPubKey, keys.spendingKey)
          }
          disabled={isScanning}
          className="brushed-metal px-12 py-6 text-on-primary font-headline font-bold text-lg tracking-widest uppercase transition-all duration-150 hover:brightness-110 disabled:opacity-50"
        >
          {isScanning ? "Scanning..." : "Scan Blockchain"}
        </button>
      </div>

      {matched.length > 0 && (
        <section className="flex flex-col gap-8">
          <div className="flex justify-between items-end border-b border-outline-variant/10 pb-4">
            <h2 className="font-headline text-xs tracking-widest uppercase text-outline">
              Detected Transfers (
              {String(matched.length).padStart(2, "0")})
            </h2>
          </div>

          {matched.map((m, i) => (
            <StealthAddressRow
              key={i}
              address={m.stealthAddress}
              privateKey={m.stealthPrivateKey}
            />
          ))}
        </section>
      )}

      {!isScanning && matched.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center opacity-50">
          <h3 className="font-headline text-xl font-bold tracking-tighter uppercase mb-2">
            No Transfers Found
          </h3>
          <p className="text-sm max-w-xs leading-relaxed text-on-surface-variant">
            Click "Scan Blockchain" to search for incoming stealth transfers.
          </p>
        </div>
      )}
    </>
  );
}

import { useEffect, useRef } from "react";
import { useAccount } from "wagmi";
import { useStealthKeysContext } from "@/context/stealth-keys";
import { useStealthKeyDerivation } from "@/hooks/useStealthKeys";

export function AutoSign() {
  const { isConnected, address } = useAccount();
  const { keys } = useStealthKeysContext();
  const { deriveKeys, isLoading } = useStealthKeyDerivation();
  const prompted = useRef<string | null>(null);

  useEffect(() => {
    if (!isConnected || !address) return;
    if (keys) return;
    if (isLoading) return;
    if (prompted.current === address) return;

    prompted.current = address;
    deriveKeys();
  }, [isConnected, address, keys, isLoading, deriveKeys]);

  // Reset when wallet disconnects so it prompts again on reconnect
  useEffect(() => {
    if (!isConnected) prompted.current = null;
  }, [isConnected]);

  return null;
}

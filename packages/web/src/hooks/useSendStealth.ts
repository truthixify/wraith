import { useState, useCallback, useEffect } from "react";
import {
  useWriteContract,
  useSendTransaction,
  useWaitForTransactionReceipt,
} from "wagmi";
import { parseEther, parseUnits, encodeFunctionData } from "viem";
import {
  generateStealthAddress,
  decodeStealthMetaAddress,
  SCHEME_ID,
} from "@wraith/sdk";
import type { HexString } from "@wraith/sdk";
import { ANNOUNCER_ABI, ANNOUNCER_ADDRESSES } from "@/config/contracts";
import { useToast } from "@/context/toast";
import { parseError } from "@/lib/errors";

const ERC20_TRANSFER_ABI = [
  {
    type: "function",
    name: "transfer",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
  },
] as const;

export interface TokenOption {
  symbol: string;
  address: `0x${string}` | "native";
  decimals: number;
}

export const TOKEN_LIST: Record<number, TokenOption[]> = {
  2651420: [
    { symbol: "ETH", address: "native", decimals: 18 },
    { symbol: "ZEN", address: "0x4b36cb6E7c257E9aA246122a997be0F7Dc1eFCd1", decimals: 18 },
    { symbol: "USDC", address: "0x01c7AEb2A0428b4159c0E333712f40e127aF639E", decimals: 6 },
  ],
  26514: [
    { symbol: "ETH", address: "native", decimals: 18 },
    { symbol: "ZEN", address: "0x57da2D504bf8b83Ef304759d9f2648522D7a9280", decimals: 18 },
    { symbol: "USDC", address: "0x52F77B624a9f20d41a60eF550e5792a00747262c", decimals: 6 },
  ],
  31337: [
    { symbol: "ETH", address: "native", decimals: 18 },
  ],
};

export function useSendStealth(chainId: number) {
  const { toast } = useToast();
  const [stealthResult, setStealthResult] = useState<{
    stealthAddress: HexString;
    ephemeralPubKey: HexString;
    viewTag: number;
  } | null>(null);

  const {
    sendTransaction,
    data: transferHash,
    isPending: isTransferPending,
    error: transferError,
    reset: resetTransfer,
  } = useSendTransaction();
  const { isLoading: isTransferConfirming, isSuccess: isTransferSuccess } =
    useWaitForTransactionReceipt({ hash: transferHash });

  const {
    writeContract,
    data: announceHash,
    isPending: isAnnouncePending,
    error: announceError,
    reset: resetAnnounce,
  } = useWriteContract();
  const { isLoading: isAnnounceConfirming, isSuccess: isAnnounceSuccess } =
    useWaitForTransactionReceipt({ hash: announceHash });

  useEffect(() => {
    if (transferError) toast(parseError(transferError), "error");
  }, [transferError, toast]);

  useEffect(() => {
    if (isTransferSuccess) toast("Transfer confirmed", "success");
  }, [isTransferSuccess, toast]);

  useEffect(() => {
    if (announceError) toast(parseError(announceError), "error");
  }, [announceError, toast]);

  useEffect(() => {
    if (isAnnounceSuccess)
      toast(
        "Announcement published — recipient can now find this transfer",
        "success"
      );
  }, [isAnnounceSuccess, toast]);

  const generateAndSend = useCallback(
    (metaAddress: string, amount: string, token: TokenOption) => {
      try {
        const decoded = decodeStealthMetaAddress(metaAddress);
        const result = generateStealthAddress(
          decoded.spendingPubKey,
          decoded.viewingPubKey
        );
        setStealthResult(result);

        if (token.address === "native") {
          sendTransaction({
            to: result.stealthAddress,
            value: parseEther(amount),
          });
        } else {
          // ERC-20 transfer
          sendTransaction({
            to: token.address,
            data: encodeFunctionData({
              abi: ERC20_TRANSFER_ABI,
              functionName: "transfer",
              args: [
                result.stealthAddress as `0x${string}`,
                parseUnits(amount, token.decimals),
              ],
            }),
          });
        }

        return result;
      } catch (err) {
        toast(parseError(err), "error");
      }
    },
    [sendTransaction, toast]
  );

  const announce = useCallback(() => {
    if (!stealthResult) return;

    const announcerAddress = ANNOUNCER_ADDRESSES[chainId];
    if (!announcerAddress) {
      toast("Announcer contract not deployed on this network", "error");
      return;
    }

    const viewTagHex = stealthResult.viewTag.toString(16).padStart(2, "0");
    const metadata = `0x${viewTagHex}` as HexString;

    writeContract({
      address: announcerAddress,
      abi: ANNOUNCER_ABI,
      functionName: "announce",
      args: [
        SCHEME_ID,
        stealthResult.stealthAddress,
        stealthResult.ephemeralPubKey,
        metadata,
      ],
    });
  }, [stealthResult, chainId, writeContract, toast]);

  const reset = useCallback(() => {
    setStealthResult(null);
    resetTransfer();
    resetAnnounce();
  }, [resetTransfer, resetAnnounce]);

  return {
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
    announceHash,
  };
}

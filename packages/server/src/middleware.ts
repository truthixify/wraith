import type { Request, Response, NextFunction } from "express";
import { privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";
import {
  deriveStealthKeys,
  encodeStealthMetaAddress,
  generateStealthAddress,
  STEALTH_SIGNING_MESSAGE,
} from "@wraith-horizen/sdk";
import type { StealthKeys, HexString } from "@wraith-horizen/sdk";
import { SessionStore } from "./sessions.js";
import { checkPayment } from "./scanner.js";
import { CHAIN_ID } from "./config.js";

export interface StealthPaymentConfig {
  price: string;
  asset: string;
  privateKey: Hex;
}

let _serverKeys: StealthKeys | null = null;
let _serverMetaAddress: string | null = null;

/**
 * Derives stealth keys from a private key by signing the STEALTH_SIGNING_MESSAGE.
 */
export async function deriveServerStealthKeys(privateKey: Hex): Promise<StealthKeys> {
  if (_serverKeys) return _serverKeys;
  const account = privateKeyToAccount(privateKey);
  const signature = await account.signMessage({ message: STEALTH_SIGNING_MESSAGE });
  _serverKeys = deriveStealthKeys(signature as HexString);
  return _serverKeys;
}

/**
 * Returns the server's stealth meta-address.
 */
export async function getServerMetaAddress(privateKey: Hex): Promise<string> {
  if (_serverMetaAddress) return _serverMetaAddress;
  const keys = await deriveServerStealthKeys(privateKey);
  _serverMetaAddress = encodeStealthMetaAddress(keys.spendingPubKey, keys.viewingPubKey);
  return _serverMetaAddress;
}

const sessions = new SessionStore();

const pendingAddresses = new Map<
  string,
  { ephemeralPubKey: string; viewTag: number; price: string }
>();

export function getSessionStore(): SessionStore {
  return sessions;
}

export function getPendingAddresses(): Map<
  string,
  { ephemeralPubKey: string; viewTag: number; price: string }
> {
  return pendingAddresses;
}

/**
 * Express middleware that enforces stealth x402 payments.
 *
 * Flow:
 * - Check for `Authorization: Bearer <token>` header — if valid session, allow through.
 * - If no valid session, generate a fresh stealth address for this request.
 * - Return 402 Payment Required with payment details.
 * - Client makes payment, then POSTs to /x402/session to claim a session token.
 */
export function stealthPaymentMiddleware(config: StealthPaymentConfig) {
  let keys: StealthKeys | null = null;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!keys) {
      keys = await deriveServerStealthKeys(config.privateKey);
    }

    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      const session = sessions.verify(token);
      if (session) {
        next();
        return;
      }
    }

    const { stealthAddress, ephemeralPubKey, viewTag } =
      generateStealthAddress(keys.spendingPubKey, keys.viewingPubKey);

    pendingAddresses.set(stealthAddress, {
      ephemeralPubKey: ephemeralPubKey as string,
      viewTag,
      price: config.price,
    });

    setTimeout(() => {
      pendingAddresses.delete(stealthAddress);
    }, 10 * 60 * 1000);

    res.status(402).json({
      paymentRequired: true,
      amount: config.price,
      asset: config.asset,
      network: `evm:${CHAIN_ID}`,
      payTo: stealthAddress,
      ephemeralPubKey,
      viewTag,
      sessionEndpoint: "/x402/session",
    });
  };
}

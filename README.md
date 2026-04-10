# Wraith

Stealth addresses for Horizen. Send and receive any asset privately with no on-chain link between sender and recipient.

## Overview

Wraith implements [ERC-5564](https://eips.ethereum.org/EIPS/eip-5564) (Stealth Address Messenger) and [ERC-6538](https://eips.ethereum.org/EIPS/eip-6538) (Stealth Meta-Address Registry) on Horizen. It ships as three packages:

- **`@wraith/sdk`** — TypeScript SDK for stealth address cryptography. Wallet-agnostic, no RPC calls, pure computation.
- **`contracts/`** — Solidity contracts (Hardhat). Announcer, Registry, WraithSender, WraithWithdrawer.
- **`packages/web`** — Vite + React web app with RainbowKit wallet integration.

## How it works

A sender takes a recipient's public stealth meta-address, generates a one-time stealth address using elliptic curve math, sends assets to it, and publishes an on-chain announcement. The recipient scans announcements with their viewing key to find incoming transfers, then derives the private key to spend from them. To outside observers, the transfer looks like a transaction to a random fresh wallet.

## Contracts (Horizen Testnet)

| Contract | Address | Purpose |
|----------|---------|---------|
| ERC5564Announcer | [`0x8AE65c05E7eb48B9bA652781Bc0a3DBA09A484F3`](https://horizen-testnet.explorer.caldera.xyz/address/0x8AE65c05E7eb48B9bA652781Bc0a3DBA09A484F3#code) | Stealth transfer announcements |
| ERC6538Registry | [`0x953E6cEdcdfAe321796e7637d33653F6Ce05c527`](https://horizen-testnet.explorer.caldera.xyz/address/0x953E6cEdcdfAe321796e7637d33653F6Ce05c527#code) | Stealth meta-address registry |
| WraithSender | [`0xb01a0A37E3f4Cc95ff7b26B28c9DA5F73f7A3e61`](https://horizen-testnet.explorer.caldera.xyz/address/0xb01a0A37E3f4Cc95ff7b26B28c9DA5F73f7A3e61#code) | Atomic send + announce (single & batch) |
| WraithWithdrawer | [`0x9F7f1C9d8B5a83245c6fC8415Ef744C458101711`](https://horizen-testnet.explorer.caldera.xyz/address/0x9F7f1C9d8B5a83245c6fC8415Ef744C458101711#code) | EIP-7702 gas-sponsored withdrawals |

All contracts are verified on the Horizen Testnet block explorer.

## Quick start

```bash
# Install dependencies
pnpm install

# Run contract tests
cd contracts && npx hardhat test

# Run SDK tests
cd packages/sdk && pnpm test

# Start web app
cd packages/web && pnpm dev
```

## Monorepo structure

```
wraith/
├── contracts/            # Hardhat — Solidity contracts + tests + deploy scripts
├── packages/
│   ├── sdk/              # @wraith/sdk — stealth address cryptography
│   └── web/              # Vite + React web app
├── subgraph/             # Goldsky subgraph config for indexing
├── SPEC.md               # Full specification
└── README.md
```

## SDK

The SDK handles all stealth address cryptography:

```typescript
import {
  deriveStealthKeys,
  encodeStealthMetaAddress,
  generateStealthAddress,
  scanAnnouncements,
  deriveStealthPrivateKey,
  STEALTH_SIGNING_MESSAGE,
} from "@wraith/sdk";

// Derive keys from a wallet signature
const keys = deriveStealthKeys(signature);

// Encode meta-address for sharing
const metaAddress = encodeStealthMetaAddress(keys.spendingPubKey, keys.viewingPubKey);

// Generate a stealth address for a recipient
const { stealthAddress, ephemeralPubKey, viewTag } = generateStealthAddress(
  recipientSpendingPubKey,
  recipientViewingPubKey
);

// Scan announcements to find incoming transfers
const matched = scanAnnouncements(announcements, viewingKey, spendingPubKey, spendingKey);

// Derive private key for a matched stealth address
const stealthPrivKey = deriveStealthPrivateKey(spendingKey, ephemeralPubKey, viewingKey);
```

## Web app

The web app connects to Horizen Testnet and Mainnet via RainbowKit. Four sections:

- **Setup** — Connect wallet, sign message to derive stealth keys, register meta-address on-chain.
- **Send** — Enter a recipient meta-address or wallet address, pick an asset (ETH, ZEN, USDC), send privately. Supports single and batch sends via the WraithSender contract.
- **Receive** — Auto-scans announcements via Goldsky subgraph. Shows stealth addresses with full token balances. One-click withdrawal derives the key in memory, signs, and discards. Batch withdraw supported.
- **About** — How stealth addresses work, ERC specs, references.

## Roadmap

- [x] Atomic send-and-announce
- [x] Token detection on stealth addresses
- [x] Gas-sponsored withdrawals via EIP-7702
- [x] Batch send
- [x] Batch withdraw
- [x] One-click withdrawal
- [x] Subgraph indexing via Goldsky
- [ ] Human-readable names (WraithNames contract)
- [ ] Payment links
- [ ] Wraith name search
- [ ] UX privacy protections
- [ ] Multi-recipient airdrop contract
- [ ] Paymaster (ERC-4337)
- [ ] ZK spending trail (shielded pool)
- [ ] FHE-DKSAP (quantum-resistant stealth addresses)
- [ ] Mobile

## References

- [ERC-5564 — Stealth Address Messenger](https://eips.ethereum.org/EIPS/eip-5564)
- [ERC-6538 — Stealth Meta-Address Registry](https://eips.ethereum.org/EIPS/eip-6538)
- [Vitalik's stealth address guide](https://vitalik.ca/general/2023/01/20/stealth.html)
- [RFC 6979 — Deterministic signatures](https://www.rfc-editor.org/rfc/rfc6979)
- [FHE-DKSAP research](https://ethresear.ch/t/fhe-dksap-fully-homomorphic-encryption-based-dual-key-stealth-address-protocol/16213)
- [Goldsky](https://goldsky.com/)

## License

MIT

// Key derivation
export { deriveStealthKeys } from "./keys.js";

// Constants
export {
  STEALTH_SIGNING_MESSAGE,
  SCHEME_ID,
  META_ADDRESS_PREFIX,
} from "./constants.js";

// Meta-address encoding
export {
  encodeStealthMetaAddress,
  decodeStealthMetaAddress,
} from "./meta-address.js";

// Stealth address generation (sender)
export { generateStealthAddress } from "./stealth.js";

// Announcement scanning (recipient)
export { checkStealthAddress, scanAnnouncements } from "./scan.js";

// Spending key derivation (recipient)
export { deriveStealthPrivateKey } from "./spend.js";

// Types
export type {
  HexString,
  StealthKeys,
  StealthMetaAddress,
  GeneratedStealthAddress,
  Announcement,
  MatchedAnnouncement,
} from "./types.js";

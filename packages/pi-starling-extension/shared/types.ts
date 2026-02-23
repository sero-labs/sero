/**
 * Shared state shape for the Starling Bank app.
 *
 * Both the Pi extension and the Sero web UI read/write a JSON file
 * matching this shape. The access token is stored encrypted with a
 * user-set PIN using AES-GCM (Web Crypto API in the UI).
 */

// ── Auth ──────────────────────────────────────────────────────

export interface AuthData {
  /** AES-GCM encrypted access token, base64 */
  encryptedToken: string | null;
  /** PBKDF2 salt, base64 */
  salt: string | null;
  /** AES-GCM initialisation vector, base64 */
  iv: string | null;
  /** SHA-256 hash of PIN for quick verification, hex */
  pinHash: string | null;
}

// ── Starling API response types ───────────────────────────────

export interface StarlingAccount {
  accountUid: string;
  accountType: string;
  defaultCategory: string;
  currency: string;
  createdAt: string;
  name: string;
}

export interface StarlingBalance {
  clearedBalance: { currency: string; minorUnits: number };
  effectiveBalance: { currency: string; minorUnits: number };
  pendingTransactions: { currency: string; minorUnits: number };
  acceptedOverdraft: { currency: string; minorUnits: number };
  amount: { currency: string; minorUnits: number };
  totalClearedBalance: { currency: string; minorUnits: number };
  totalEffectiveBalance: { currency: string; minorUnits: number };
}

export interface StarlingFeedItem {
  feedItemUid: string;
  categoryUid: string;
  amount: { currency: string; minorUnits: number };
  sourceAmount: { currency: string; minorUnits: number };
  direction: 'IN' | 'OUT';
  transactionTime: string;
  settlementTime: string;
  status: 'UPCOMING' | 'PENDING' | 'REVERSED' | 'SETTLED' | 'DECLINED' | 'REFUNDED' | 'RETRYING' | 'ACCOUNT_CHECK';
  counterPartyName: string;
  counterPartyType: string;
  reference: string;
  country: string;
  spendingCategory: string;
}

export interface StarlingAccountHolder {
  accountHolderUid: string;
  accountHolderType: string;
}

export interface StarlingSavingsGoal {
  savingsGoalUid: string;
  name: string;
  target: { currency: string; minorUnits: number } | null;
  totalSaved: { currency: string; minorUnits: number };
  savedPercentage: number | null;
  state: string;
}

// ── Cached data ───────────────────────────────────────────────

export interface CachedData {
  accountHolder: StarlingAccountHolder | null;
  accounts: StarlingAccount[] | null;
  balance: StarlingBalance | null;
  transactions: StarlingFeedItem[] | null;
  savingsGoals: StarlingSavingsGoal[] | null;
  lastFetchedAt: string | null;
}

// ── App state ─────────────────────────────────────────────────

export interface StarlingState {
  auth: AuthData;
  cache: CachedData;
  selectedAccountUid: string | null;
}

export const DEFAULT_STATE: StarlingState = {
  auth: {
    encryptedToken: null,
    salt: null,
    iv: null,
    pinHash: null,
  },
  cache: {
    accountHolder: null,
    accounts: null,
    balance: null,
    transactions: null,
    savingsGoals: null,
    lastFetchedAt: null,
  },
  selectedAccountUid: null,
};

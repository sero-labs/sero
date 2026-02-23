/**
 * Shared state shape for the Starling Bank app.
 *
 * Both the Pi extension and the Sero web UI read/write a JSON file
 * matching this shape.
 *
 * Security model:
 *   - The access token is encrypted via Electron's safeStorage API
 *     (macOS Keychain / Windows DPAPI). Only this app, on this machine,
 *     by the current OS user can decrypt it.
 *   - The PIN is a UX-level lock (prevents casual access). Its salted
 *     hash is stored for quick verification, but the PIN itself is NOT
 *     the encryption key — safeStorage is the security boundary.
 */

// ── Auth ──────────────────────────────────────────────────────

export interface AuthData {
  /** safeStorage-encrypted access token, base64 */
  encryptedToken: string | null;
  /** SHA-256 hash of (pinSalt + PIN) for app-level lock verification, hex */
  pinHash: string | null;
  /** Random salt for the PIN hash, base64 */
  pinSalt: string | null;
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
    pinHash: null,
    pinSalt: null,
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

/**
 * Web token management — time-limited tokens for remote web access.
 *
 * Web tokens are separate from the master gateway token. They expire
 * after a configurable period (default 7 days) and can be created/revoked
 * individually. Maximum 10 active tokens at a time.
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const MAX_TOKENS = 10;
const DEFAULT_EXPIRY_DAYS = 7;
const TOKEN_LENGTH = 32;

function normalizeWorkspaceScope(value: unknown): { ok: true; workspaceIds: string[] | null } | { ok: false } {
  if (value === undefined || value === null) {
    return { ok: true, workspaceIds: null };
  }
  if (!Array.isArray(value) || value.length === 0) {
    return { ok: false };
  }

  const workspaceIds = value.filter(
    (workspaceId): workspaceId is string => typeof workspaceId === 'string' && workspaceId.length > 0,
  );
  if (workspaceIds.length !== value.length) {
    return { ok: false };
  }

  return { ok: true, workspaceIds: [...new Set(workspaceIds)] };
}

function normalizeWebToken(value: unknown): WebToken[] {
  if (typeof value !== 'object' || value === null) {
    return [];
  }

  const token = 'token' in value && typeof value.token === 'string' ? value.token : null;
  const createdAt = 'createdAt' in value && typeof value.createdAt === 'string' ? value.createdAt : null;
  const expiresAt = 'expiresAt' in value && typeof value.expiresAt === 'string' ? value.expiresAt : null;
  const label = 'label' in value && typeof value.label === 'string' ? value.label : null;
  const workspaceScope = normalizeWorkspaceScope('workspaceIds' in value ? value.workspaceIds : undefined);

  if (!token || !createdAt || !expiresAt || !label || !workspaceScope.ok) {
    return [];
  }

  return [{ token, createdAt, expiresAt, label, workspaceIds: workspaceScope.workspaceIds }];
}

/** Told when tokens stop being valid, by revoke or by expiry. */
type TokensGoneListener = (tokenIds: string[]) => void;

const tokensGoneListeners: TokensGoneListener[] = [];

/**
 * Watch for tokens that stop being valid.
 *
 * A token's id is the first 8 characters of the token, which is what
 * every other part of the gateway files things under.
 */
export function onWebTokensGone(listener: TokensGoneListener): () => void {
  tokensGoneListeners.push(listener);
  return () => {
    const at = tokensGoneListeners.indexOf(listener);
    if (at !== -1) tokensGoneListeners.splice(at, 1);
  };
}

function announceGone(tokens: WebToken[]): void {
  if (tokens.length === 0) return;
  const ids = tokens.map((token) => token.token.slice(0, 8));
  for (const listener of tokensGoneListeners) listener(ids);
}

export interface WebToken {
  token: string;
  createdAt: string;
  expiresAt: string;
  label: string;
  /** Null means unrestricted owner access across current and future workspaces. */
  workspaceIds: string[] | null;
}

export class WebTokenManager {
  private tokens: WebToken[] = [];
  private readonly filePath: string;

  constructor(configDir: string) {
    this.filePath = path.join(configDir, 'gateway-web-tokens.json');
    this.load();
    this.pruneExpired();
  }

  /** Create a new web token. Returns the token details. */
  create(workspaceIds: string[] | null, label?: string, expiryDays?: number): WebToken {
    if (workspaceIds !== null && workspaceIds.length === 0) {
      throw new Error('Web tokens must be scoped to at least one workspace');
    }

    this.pruneExpired();

    // Enforce max tokens — remove oldest if at limit
    while (this.tokens.length >= MAX_TOKENS) {
      this.tokens.shift();
    }

    const days = expiryDays ?? DEFAULT_EXPIRY_DAYS;
    const now = new Date();
    const expires = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

    const webToken: WebToken = {
      token: crypto.randomBytes(TOKEN_LENGTH).toString('hex'),
      createdAt: now.toISOString(),
      expiresAt: expires.toISOString(),
      label: label ?? `Web token ${now.toLocaleDateString()}`,
      workspaceIds: workspaceIds ? [...new Set(workspaceIds)] : null,
    };

    this.tokens.push(webToken);
    this.save();
    console.log(`[web-tokens] Created token: ${webToken.label} (expires ${webToken.expiresAt})`);

    return webToken;
  }

  /** List all active (non-expired) tokens. Returns tokens with masked values. */
  list(): Array<Omit<WebToken, 'token'> & { tokenId: string; tokenPreview: string }> {
    this.pruneExpired();
    return this.tokens.map((t) => ({
      tokenId: t.token.slice(0, 8),
      tokenPreview: `${t.token.slice(0, 8)}…${t.token.slice(-4)}`,
      createdAt: t.createdAt,
      expiresAt: t.expiresAt,
      label: t.label,
      workspaceIds: t.workspaceIds,
    }));
  }

  /** Revoke a token by its ID prefix (first 8 chars). */
  revoke(tokenId: string): boolean {
    const removed = this.tokens.filter((t) => t.token.startsWith(tokenId));
    if (removed.length === 0) return false;

    this.tokens = this.tokens.filter((t) => !t.token.startsWith(tokenId));
    this.save();
    console.log(`[web-tokens] Revoked token: ${tokenId}`);
    // Whatever was filed under this token — a phone's push subscription,
    // for one — has to go with it.
    announceGone(removed);
    return true;
  }

  /** Validate a token. Returns the scoped token if valid and not expired. */
  validate(token: string): WebToken | null {
    const now = Date.now();
    for (const wt of this.tokens) {
      if (new Date(wt.expiresAt).getTime() <= now) continue;
      // Constant-time comparison
      if (token.length !== wt.token.length) continue;
      if (crypto.timingSafeEqual(Buffer.from(token), Buffer.from(wt.token))) {
        return wt;
      }
    }
    return null;
  }

  /** Remove expired tokens. */
  private pruneExpired(): void {
    const now = Date.now();
    const expired = this.tokens.filter((t) => new Date(t.expiresAt).getTime() <= now);
    if (expired.length === 0) return;

    this.tokens = this.tokens.filter((t) => new Date(t.expiresAt).getTime() > now);
    this.save();
    announceGone(expired);
  }

  /** Load tokens from disk. */
  private load(): void {
    try {
      const data = fs.readFileSync(this.filePath, 'utf-8');
      const parsed = JSON.parse(data) as unknown;
      this.tokens = Array.isArray(parsed)
        ? parsed.flatMap((token) => normalizeWebToken(token))
        : [];
    } catch {
      this.tokens = [];
    }
  }

  /** Persist tokens to disk with restricted permissions. */
  private save(): void {
    try {
      const dir = path.dirname(this.filePath);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify(this.tokens, null, 2), {
        mode: 0o600,
      });
    } catch (err) {
      console.error('[web-tokens] Failed to save:', err);
    }
  }
}

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

export interface WebToken {
  token: string;
  createdAt: string;
  expiresAt: string;
  label: string;
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
  create(label?: string, expiryDays?: number): WebToken {
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
    }));
  }

  /** Revoke a token by its ID prefix (first 8 chars). */
  revoke(tokenId: string): boolean {
    const before = this.tokens.length;
    this.tokens = this.tokens.filter((t) => !t.token.startsWith(tokenId));
    if (this.tokens.length < before) {
      this.save();
      console.log(`[web-tokens] Revoked token: ${tokenId}`);
      return true;
    }
    return false;
  }

  /** Validate a token. Returns true if the token is valid and not expired. */
  validate(token: string): boolean {
    const now = Date.now();
    for (const wt of this.tokens) {
      if (new Date(wt.expiresAt).getTime() <= now) continue;
      // Constant-time comparison
      if (token.length !== wt.token.length) continue;
      if (crypto.timingSafeEqual(Buffer.from(token), Buffer.from(wt.token))) {
        return true;
      }
    }
    return false;
  }

  /** Remove expired tokens. */
  private pruneExpired(): void {
    const now = Date.now();
    const before = this.tokens.length;
    this.tokens = this.tokens.filter(
      (t) => new Date(t.expiresAt).getTime() > now,
    );
    if (this.tokens.length < before) {
      this.save();
    }
  }

  /** Load tokens from disk. */
  private load(): void {
    try {
      const data = fs.readFileSync(this.filePath, 'utf-8');
      this.tokens = JSON.parse(data);
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

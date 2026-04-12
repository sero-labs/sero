/**
 * Gateway authentication — token generation and validation.
 *
 * A single master bearer token is generated on first run and stored on disk.
 * All gateway clients must present either that master token or a scoped web
 * token created from the desktop app. Web tokens are limited to one or more
 * explicit workspace IDs.
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { WebTokenManager } from '../bridge/web-tokens';

const TOKEN_LENGTH = 32;

export interface GatewayAuthResult {
  type: 'master' | 'web';
  authorizedWorkspaceIds: string[] | null;
}

export class GatewayAuth {
  private token: string | null = null;
  readonly webTokens: WebTokenManager;

  constructor(private readonly tokenPath: string) {
    const configDir = path.dirname(tokenPath);
    this.webTokens = new WebTokenManager(configDir);
  }

  /** Get the current auth token, generating one if needed. */
  getToken(): string {
    if (this.token) return this.token;

    // Try to load from disk
    try {
      const stored = fs.readFileSync(this.tokenPath, 'utf-8').trim();
      if (stored.length >= TOKEN_LENGTH) {
        this.token = stored;
        console.log(`[gateway] Auth token loaded: ${this.token.slice(0, 8)}…${this.token.slice(-4)} (full token: cat ${this.tokenPath})`);
        return this.token;
      }
    } catch {
      // File doesn't exist — generate a new token
    }

    // Generate new token
    this.token = crypto.randomBytes(TOKEN_LENGTH).toString('hex');

    // Persist to disk
    const dir = path.dirname(this.tokenPath);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.tokenPath, this.token, { mode: 0o600 });
    console.log(`[gateway] Auth token generated: ${this.token.slice(0, 8)}…${this.token.slice(-4)} (full token: cat ${this.tokenPath})`);

    return this.token;
  }

  /** Validate a token from a client — accepts master token OR valid scoped web token. */
  validate(token: string): GatewayAuthResult | null {
    // Check master token first (constant-time)
    const expected = this.getToken();
    if (token.length === expected.length) {
      if (crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected))) {
        return {
          type: 'master',
          authorizedWorkspaceIds: null,
        };
      }
    }

    const webToken = this.webTokens.validate(token);
    if (!webToken) {
      return null;
    }

    return {
      type: 'web',
      authorizedWorkspaceIds: webToken.workspaceIds,
    };
  }


  /** Regenerate the token (invalidates all existing connections). */
  regenerate(): string {
    this.token = null;
    // Delete existing file so getToken() generates a new one
    try {
      fs.unlinkSync(this.tokenPath);
    } catch {
      // May not exist
    }
    return this.getToken();
  }
}

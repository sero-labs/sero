/**
 * Gateway authentication — token generation and validation.
 *
 * A single bearer token is generated on first run and stored on disk.
 * All gateway clients must present this token to connect.
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const TOKEN_LENGTH = 32;

export class GatewayAuth {
  private token: string | null = null;

  constructor(private readonly tokenPath: string) {}

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

  /** Validate a token from a client. */
  validate(token: string): boolean {
    const expected = this.getToken();
    // Constant-time comparison to prevent timing attacks
    if (token.length !== expected.length) return false;
    return crypto.timingSafeEqual(
      Buffer.from(token),
      Buffer.from(expected),
    );
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

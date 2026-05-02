/**
 * Rate limiter for gateway authentication and request throttling.
 *
 * Uses a sliding-window counter per key (typically client IP).
 * After `maxAttempts` within `windowMs`, the key is blocked for `blockMs`.
 */

export interface RateLimiterConfig {
  /** Maximum attempts within the time window before blocking. */
  maxAttempts: number;
  /** Time window in milliseconds. */
  windowMs: number;
  /** Block duration in milliseconds after limit is exceeded. */
  blockMs: number;
}

interface RateLimitEntry {
  /** Timestamps of recent attempts within the window. */
  attempts: number[];
  /** If set, the key is blocked until this timestamp. */
  blockedUntil: number | null;
}

export class RateLimiter {
  private entries = new Map<string, RateLimitEntry>();
  private cleanupTimer: ReturnType<typeof setInterval>;

  constructor(private config: RateLimiterConfig) {
    // Periodically clean up stale entries to prevent memory leaks
    this.cleanupTimer = setInterval(() => this.cleanup(), 60_000);
  }

  /**
   * Check if a key is allowed to proceed. Records the attempt.
   * Returns `true` if allowed, `false` if rate-limited.
   */
  check(key: string): boolean {
    const now = Date.now();
    let entry = this.entries.get(key);

    if (!entry) {
      entry = { attempts: [], blockedUntil: null };
      this.entries.set(key, entry);
    }

    // Check if currently blocked
    if (entry.blockedUntil && now < entry.blockedUntil) {
      return false;
    }

    // Clear expired block
    if (entry.blockedUntil && now >= entry.blockedUntil) {
      entry.blockedUntil = null;
      entry.attempts = [];
    }

    // Remove attempts outside the window
    const windowStart = now - this.config.windowMs;
    entry.attempts = entry.attempts.filter((t) => t > windowStart);

    // Record this attempt
    entry.attempts.push(now);

    // Check if limit exceeded — block when attempts reach maxAttempts
    // (e.g. maxAttempts: 5 means the 5th failed attempt triggers a block)
    if (entry.attempts.length >= this.config.maxAttempts) {
      entry.blockedUntil = now + this.config.blockMs;
      return false;
    }

    return true;
  }

  /** Check if a key is currently blocked (without recording an attempt). */
  isBlocked(key: string): boolean {
    const entry = this.entries.get(key);
    if (!entry?.blockedUntil) return false;
    return Date.now() < entry.blockedUntil;
  }

  /** Reset a specific key (e.g. after successful auth). */
  reset(key: string): void {
    this.entries.delete(key);
  }

  /** Remove stale entries that are no longer blocked and have no recent attempts. */
  private cleanup(): void {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;

    for (const [key, entry] of this.entries) {
      if (entry.blockedUntil && now >= entry.blockedUntil) {
        this.entries.delete(key);
        continue;
      }
      const recentAttempts = entry.attempts.filter((t) => t > windowStart);
      if (recentAttempts.length === 0 && !entry.blockedUntil) {
        this.entries.delete(key);
      }
    }
  }

  dispose(): void {
    clearInterval(this.cleanupTimer);
    this.entries.clear();
  }
}

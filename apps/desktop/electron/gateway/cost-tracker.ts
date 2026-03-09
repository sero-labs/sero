/**
 * Gateway cost tracker — per-session and per-day cost limits.
 *
 * Tracks token usage from agent responses, estimates dollar cost using
 * approximate per-token pricing, and enforces configurable limits to
 * prevent unbounded API spend from compromised or runaway gateway clients.
 */

import fs from 'fs';
import path from 'path';

// ── Pricing tiers (per million tokens) ──────────────────────

interface PricingTier {
  inputPerM: number;
  outputPerM: number;
}

/** Approximate pricing by model family. Conservative (high) estimates. */
const MODEL_PRICING: Record<string, PricingTier> = {
  // Anthropic
  'opus': { inputPerM: 15, outputPerM: 75 },
  'sonnet': { inputPerM: 3, outputPerM: 15 },
  'haiku': { inputPerM: 0.25, outputPerM: 1.25 },
  // OpenAI
  'gpt-4o': { inputPerM: 2.5, outputPerM: 10 },
  'gpt-4': { inputPerM: 30, outputPerM: 60 },
  'gpt-3.5': { inputPerM: 0.5, outputPerM: 1.5 },
  'o1': { inputPerM: 15, outputPerM: 60 },
  'o3': { inputPerM: 10, outputPerM: 40 },
  // Google
  'gemini-2': { inputPerM: 1.25, outputPerM: 10 },
  'gemini-pro': { inputPerM: 1.25, outputPerM: 5 },
};

/** Default pricing for unknown models — uses Sonnet-tier as conservative default. */
const DEFAULT_PRICING: PricingTier = { inputPerM: 3, outputPerM: 15 };

/**
 * Pricing keys sorted by length descending so longer (more specific)
 * keys match first — e.g. 'gpt-4o' before 'gpt-4'.
 */
const SORTED_PRICING_KEYS = Object.keys(MODEL_PRICING).sort(
  (a, b) => b.length - a.length,
);

/** Resolve pricing tier from a model ID string (longest match wins). */
function getPricing(modelId: string): PricingTier {
  const lower = modelId.toLowerCase();
  for (const key of SORTED_PRICING_KEYS) {
    if (lower.includes(key)) return MODEL_PRICING[key];
  }
  return DEFAULT_PRICING;
}

// ── Config ──────────────────────────────────────────────────

export interface CostLimitsConfig {
  /** Maximum cost (USD) per individual session. Default: $5. */
  maxCostPerSession: number;
  /** Maximum cost (USD) per calendar day. Default: $50. */
  maxCostPerDay: number;
  /** Maximum concurrent active sessions. Default: 3. */
  maxConcurrentSessions: number;
}

const DEFAULT_LIMITS: CostLimitsConfig = {
  maxCostPerSession: 5.0,
  maxCostPerDay: 50.0,
  maxConcurrentSessions: 10,
};

// ── Cost Tracker ────────────────────────────────────────────

interface SessionCost {
  totalCost: number;
  inputTokens: number;
  outputTokens: number;
}

export interface LimitCheckResult {
  allowed: boolean;
  reason?: string;
}

export class CostTracker {
  private sessionCosts = new Map<string, SessionCost>();
  private dailyCost = 0;
  private dailyDate = this.todayKey();
  private activeSessions = new Set<string>();
  private limits: CostLimitsConfig;
  private configPath: string;

  constructor(configDir: string) {
    this.configPath = path.join(configDir, 'gateway-config.json');
    this.limits = this.loadConfig();
  }

  /** Record token usage from a completed agent response. */
  recordUsage(
    sessionId: string,
    modelId: string,
    inputTokens: number,
    outputTokens: number,
  ): void {
    const pricing = getPricing(modelId);
    const cost =
      (inputTokens / 1_000_000) * pricing.inputPerM +
      (outputTokens / 1_000_000) * pricing.outputPerM;

    // Reset daily counter and prune stale sessions on day change
    const today = this.todayKey();
    if (today !== this.dailyDate) {
      this.dailyCost = 0;
      this.dailyDate = today;
      this.pruneStaleSessionCosts();
    }

    // Update session cost
    const session = this.sessionCosts.get(sessionId) ?? {
      totalCost: 0,
      inputTokens: 0,
      outputTokens: 0,
    };
    session.totalCost += cost;
    session.inputTokens += inputTokens;
    session.outputTokens += outputTokens;
    this.sessionCosts.set(sessionId, session);

    // Update daily cost
    this.dailyCost += cost;

    console.log(
      `[gateway:cost] Session ${sessionId}: +$${cost.toFixed(4)} ` +
        `(session total: $${session.totalCost.toFixed(4)}, ` +
        `daily: $${this.dailyCost.toFixed(4)})`,
    );
  }

  /** Mark a session as active (for concurrency limiting). */
  markActive(sessionId: string): void {
    this.activeSessions.add(sessionId);
  }

  /** Mark a session as inactive. */
  markInactive(sessionId: string): void {
    this.activeSessions.delete(sessionId);
  }

  /**
   * Check whether a prompt should be allowed for a session.
   * Call before forwarding a prompt to the agent.
   */
  checkLimits(sessionId: string): LimitCheckResult {
    // Reset daily counter on day change
    const today = this.todayKey();
    if (today !== this.dailyDate) {
      this.dailyCost = 0;
      this.dailyDate = today;
    }

    // Daily cost limit
    if (this.dailyCost >= this.limits.maxCostPerDay) {
      return {
        allowed: false,
        reason: `Daily cost limit exceeded ($${this.dailyCost.toFixed(2)} / $${this.limits.maxCostPerDay.toFixed(2)})`,
      };
    }

    // Per-session cost limit
    const session = this.sessionCosts.get(sessionId);
    if (session && session.totalCost >= this.limits.maxCostPerSession) {
      return {
        allowed: false,
        reason: `Session cost limit exceeded ($${session.totalCost.toFixed(2)} / $${this.limits.maxCostPerSession.toFixed(2)})`,
      };
    }

    // Concurrent session limit
    if (
      !this.activeSessions.has(sessionId) &&
      this.activeSessions.size >= this.limits.maxConcurrentSessions
    ) {
      return {
        allowed: false,
        reason: `Max concurrent sessions reached (${this.activeSessions.size} / ${this.limits.maxConcurrentSessions})`,
      };
    }

    return { allowed: true };
  }

  /** Get current cost summary (for status/debugging). */
  getSummary(): {
    dailyCost: number;
    dailyLimit: number;
    activeSessions: number;
    sessionCount: number;
  } {
    return {
      dailyCost: this.dailyCost,
      dailyLimit: this.limits.maxCostPerDay,
      activeSessions: this.activeSessions.size,
      sessionCount: this.sessionCosts.size,
    };
  }

  // ── Internal ──────────────────────────────────────────────

  /** UTC date key — daily limits reset at UTC midnight. */
  private todayKey(): string {
    return new Date().toISOString().slice(0, 10);
  }

  /** Evict session cost entries that haven't been updated in >24h. */
  private pruneStaleSessionCosts(): void {
    // Simple heuristic: on day change, clear sessions that are no longer
    // active (not currently running a prompt). Active sessions are kept.
    for (const id of this.sessionCosts.keys()) {
      if (!this.activeSessions.has(id)) {
        this.sessionCosts.delete(id);
      }
    }
  }

  /** Return value if it's a positive number, otherwise the fallback. */
  private static positiveNum(val: unknown, fallback: number): number {
    return typeof val === 'number' && val > 0 && Number.isFinite(val)
      ? val
      : fallback;
  }

  private loadConfig(): CostLimitsConfig {
    try {
      const raw = fs.readFileSync(this.configPath, 'utf-8');
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      return {
        maxCostPerSession: CostTracker.positiveNum(
          parsed.maxCostPerSession, DEFAULT_LIMITS.maxCostPerSession,
        ),
        maxCostPerDay: CostTracker.positiveNum(
          parsed.maxCostPerDay, DEFAULT_LIMITS.maxCostPerDay,
        ),
        maxConcurrentSessions: CostTracker.positiveNum(
          parsed.maxConcurrentSessions, DEFAULT_LIMITS.maxConcurrentSessions,
        ),
      };
    } catch {
      // File doesn't exist or is invalid — write defaults
      this.saveConfig(DEFAULT_LIMITS);
      return { ...DEFAULT_LIMITS };
    }
  }

  private saveConfig(config: CostLimitsConfig): void {
    try {
      const dir = path.dirname(this.configPath);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        this.configPath,
        JSON.stringify(config, null, 2) + '\n',
        { mode: 0o600 },
      );
    } catch (err) {
      console.warn('[gateway:cost] Failed to write config:', err);
    }
  }
}

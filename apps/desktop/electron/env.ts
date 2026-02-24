/**
 * Load environment variables from ~/.sero-ui/agent/.env and set
 * PI_CODING_AGENT_DIR so the Pi SDK resolves all config from Sero's
 * own agent directory instead of ~/.pi/agent.
 *
 * Simple KEY=VALUE parser. Supports:
 *   - Lines with KEY=VALUE (no spaces around =)
 *   - Quoted values: KEY="value" or KEY='value'
 *   - Comments (#) and blank lines
 *   - Does NOT override existing env vars
 *
 * Call this before any SDK imports that read process.env.
 */

import { readFileSync } from 'fs';
import os from 'os';
import path from 'path';

/** Sero's root config directory. Respects SERO_HOME env var for testing. */
export const SERO_HOME = process.env.SERO_HOME || path.join(os.homedir(), '.sero-ui');

/** Sero's agent directory — replaces ~/.pi/agent for all SDK calls. */
export const SERO_AGENT_DIR = path.join(SERO_HOME, 'agent');

const ENV_PATH = path.join(SERO_AGENT_DIR, '.env');

export function loadSeroEnv(): void {
  // ── Redirect the Pi SDK to Sero's agent directory ──────────
  // This MUST happen before any SDK module is imported. The SDK reads
  // PI_CODING_AGENT_DIR at module-load time via getAgentDir().
  if (!process.env.PI_CODING_AGENT_DIR) {
    process.env.PI_CODING_AGENT_DIR = SERO_AGENT_DIR;
  }

  // ── Expose SERO_HOME for extensions ────────────────────────
  // Global-scoped app extensions use this to resolve their state
  // path (~/.sero-ui/apps/<appId>/state.json) instead of cwd.
  if (!process.env.SERO_HOME) {
    process.env.SERO_HOME = SERO_HOME;
  }

  // ── Load .env file ────────────────────────────────────────
  let content: string;
  try {
    content = readFileSync(ENV_PATH, 'utf8');
  } catch {
    // File doesn't exist yet — that's fine
    return;
  }

  for (const raw of content.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;

    const eqIndex = line.indexOf('=');
    if (eqIndex === -1) continue;

    const key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();

    // Strip matching quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    // Don't override existing env vars
    if (key && !(key in process.env)) {
      process.env[key] = value;
    }
  }
}

/**
 * Load environment variables from ~/.sero-ui/agent/.env
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

const ENV_PATH = path.join(os.homedir(), '.sero-ui', 'agent', '.env');

export function loadSeroEnv(): void {
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

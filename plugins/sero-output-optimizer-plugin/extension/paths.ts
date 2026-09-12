import { homedir } from 'node:os';
import path from 'node:path';

/**
 * Resolve the Sero root for the active profile.
 *
 * The plugin config lives in the Sero profile state directory. It is never
 * placed under `~/.pi`, which the host only points at for Pi SDK resources.
 */
export function resolveSeroHome(): string {
  const envValue = process.env.SERO_HOME?.trim();
  if (envValue && envValue !== 'undefined' && envValue !== 'null') {
    return envValue;
  }
  return path.join(homedir(), '.sero-ui');
}

/** Absolute path of the output optimiser config file. */
export function resolveOptimizerConfigPath(): string {
  return path.join(resolveSeroHome(), 'state', 'output-optimizer', 'config.json');
}

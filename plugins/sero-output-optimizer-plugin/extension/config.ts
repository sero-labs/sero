import { defaultOptimizerConfig, OPTIMIZER_CONFIG_VERSION, REWRITE_CLASSES, type OutputOptimizerConfig, type RewriteClass } from '../shared/types';
import { resolveOptimizerConfigPath } from './paths';
import fs from 'node:fs';
import path from 'node:path';
/** Load and persist the plugin config in the Sero profile state directory. */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Merge an unknown value with the defaults. Unknown classes stay enabled. */
export function normalizeConfig(value: unknown): OutputOptimizerConfig {
  const defaults = defaultOptimizerConfig();
  if (!isRecord(value)) return defaults;

  const classes = isRecord(value.rewriteClasses) ? value.rewriteClasses : {};
  const rewriteClasses = {} as Record<RewriteClass, boolean>;
  for (const rewriteClass of REWRITE_CLASSES) {
    rewriteClasses[rewriteClass] = classes[rewriteClass] !== false;
  }

  return {
    version: OPTIMIZER_CONFIG_VERSION,
    enabled: value.enabled === true,
    rewriteClasses,
    notices: value.notices !== false,
  };
}

export async function loadConfig(): Promise<OutputOptimizerConfig> {
  try {
    const raw = await fs.promises.readFile(resolveOptimizerConfigPath(), 'utf8');
    return normalizeConfig(JSON.parse(raw));
  } catch {
    return defaultOptimizerConfig();
  }
}

/** Atomic write: temp file, then rename. */
export async function saveConfig(config: OutputOptimizerConfig): Promise<void> {
  const target = resolveOptimizerConfigPath();
  await fs.promises.mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
  await fs.promises.writeFile(temporary, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  await fs.promises.rename(temporary, target);
}

/**
 * One config source for every active session.
 *
 * The file in the profile state directory is the source of truth, so a change
 * made in one session reaches the others. Each intervention refreshes before
 * it reads, which makes that propagation take effect without a restart.
 */
export class ConfigStore {
  private config: OutputOptimizerConfig = defaultOptimizerConfig();
  private mtimeMs = -1;
  private size = -1;

  current(): OutputOptimizerConfig {
    return this.config;
  }

  /** Re-read the file only when it changed since the last read. */
  async refresh(): Promise<OutputOptimizerConfig> {
    const target = resolveOptimizerConfigPath();
    try {
      const stat = await fs.promises.stat(target);
      if (stat.mtimeMs === this.mtimeMs && stat.size === this.size) return this.config;
      const raw = await fs.promises.readFile(target, 'utf8');
      this.config = normalizeConfig(JSON.parse(raw));
      this.mtimeMs = stat.mtimeMs;
      this.size = stat.size;
    } catch {
      // Keep the last good config when the file is missing or unreadable.
      if (this.mtimeMs === -1) this.config = defaultOptimizerConfig();
    }
    return this.config;
  }

  async save(next: OutputOptimizerConfig): Promise<OutputOptimizerConfig> {
    this.config = normalizeConfig(next);
    await saveConfig(this.config);
    try {
      const stat = await fs.promises.stat(resolveOptimizerConfigPath());
      this.mtimeMs = stat.mtimeMs;
      this.size = stat.size;
    } catch {
      // A failed stat only means the next refresh re-reads the file.
    }
    return this.config;
  }
}

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

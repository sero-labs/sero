/**
 * Shared, JSON-serialisable types for the output optimiser.
 *
 * The extension owns config and metrics; the UI reads a snapshot through a
 * bridged tool, so every value here must survive `JSON.stringify`.
 */

export const OPTIMIZER_CONFIG_VERSION = 1;

/** Classes of rewritten command, keyed by the RTK subcommand in the rewrite. */
export const REWRITE_CLASSES = [
  'fileReads',
  'git',
  'containers',
  'github',
  'tests',
  'builds',
  'packageManagers',
  'other',
] as const;

export type RewriteClass = (typeof REWRITE_CLASSES)[number];

export const REWRITE_CLASS_LABELS: Record<RewriteClass, string> = {
  fileReads: 'File reads',
  git: 'Git',
  containers: 'Containers',
  github: 'GitHub',
  tests: 'Tests',
  builds: 'Builds and type checks',
  packageManagers: 'Package managers',
  other: 'Other',
};

export interface OutputOptimizerConfig {
  version: typeof OPTIMIZER_CONFIG_VERSION;
  /** Output optimisation is off for a new profile. */
  enabled: boolean;
  /** One kill switch per rewrite class. Disabled discards the whole rewrite. */
  rewriteClasses: Record<RewriteClass, boolean>;
  /** Whether optimisation notices are added to results. */
  notices: boolean;
}

export function defaultOptimizerConfig(): OutputOptimizerConfig {
  const rewriteClasses = {} as Record<RewriteClass, boolean>;
  for (const rewriteClass of REWRITE_CLASSES) rewriteClasses[rewriteClass] = true;
  return {
    version: OPTIMIZER_CONFIG_VERSION,
    enabled: false,
    rewriteClasses,
    notices: true,
  };
}

/** Why RTK is unavailable, as shown in settings. */
export type RtkStatusState = 'unknown' | 'available' | 'installing' | 'failed';

export interface RtkStatusView {
  state: RtkStatusState;
  version?: string;
  reason?: string;
}

/** Plugin compaction accounting for one session. */
export interface SessionSavings {
  /** Eligible calls with a complete capture, including zero-savings calls. */
  measuredCalls: number;
  /** Eligible calls whose capture was incomplete or unreadable. */
  unmeasuredCalls: number;
  /** Sum of complete executed-command capture bytes before compaction. */
  inputBytes: number;
  /** Sum of complete candidate bytes after compaction, before preview limits. */
  compactedBytes: number;
  /** Calls where rewriting or compaction actually changed the result. */
  optimizedCalls: number;
  /** Compaction and rewriting skips recorded without claiming savings. */
  skippedCalls: number;
}

export function emptySessionSavings(): SessionSavings {
  return {
    measuredCalls: 0,
    unmeasuredCalls: 0,
    inputBytes: 0,
    compactedBytes: 0,
    optimizedCalls: 0,
    skippedCalls: 0,
  };
}

/** State the UI reads and writes through the `output_optimizer` tool. */
export interface OutputOptimizerState {
  config: OutputOptimizerConfig;
  savings: SessionSavings;
  rtk: RtkStatusView;
}

/**
 * Session reduction percentage, or `null` when there is nothing measured.
 *
 * Total removed bytes divided by total measured input bytes. A zero
 * denominator displays no percentage.
 */
export function reductionPercent(savings: SessionSavings): number | null {
  if (savings.inputBytes <= 0) return null;
  const removed = savings.inputBytes - savings.compactedBytes;
  return (removed / savings.inputBytes) * 100;
}

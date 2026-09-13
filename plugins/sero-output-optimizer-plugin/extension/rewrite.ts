import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import type { RtkToolchainResolution } from '@sero-ai/common';

import type { OutputOptimizerConfig } from '../shared/types';
import { analyzeCommand, rewriteBlockReason } from './command-analysis';
import { bindRtkInvocations, isBindFailure } from './binding';
import { collectRtkInvocations } from './rewrite-class';

/**
 * Ask the pinned RTK for a rewrite and bind the result to the runtime.
 *
 * Exit codes 0 and 3 are rewrite candidates, 1 is no equivalent, 2 is an
 * upstream decline. They never grant Sero execution permission.
 */

export type RewriteState = 'rewritten' | 'unchanged' | 'blocked' | 'unavailable' | 'declined' | 'failed';

export interface RewriteOutcome {
  state: RewriteState;
  requested: string;
  executed: string;
  /** The RTK form, without the bound runtime executable and state environment. */
  display?: string;
  reason?: string;
}

export interface RewriteInput {
  pi: ExtensionAPI;
  command: string;
  resolution: RtkToolchainResolution;
  config: OutputOptimizerConfig;
  platform: string;
  timeoutMs?: number;
  /** Injectable probe, used by tests. */
  probe?: (executable: string, command: string) => Promise<{ stdout: string; code: number }>;
}

const DEFAULT_TIMEOUT_MS = 5_000;

function unchanged(command: string, reason?: string): RewriteOutcome {
  return { state: 'unchanged', requested: command, executed: command, reason };
}

function alreadyRtk(command: string): boolean {
  const analysis = analyzeCommand(command);
  return analysis.segments[0]?.command === 'rtk';
}

export async function computeRewrite(input: RewriteInput): Promise<RewriteOutcome> {
  const { command, resolution, config } = input;
  if (!command.trim()) return unchanged(command, 'empty command');
  if (alreadyRtk(command)) return unchanged(command, 'already an rtk command');

  const analysis = analyzeCommand(command);
  const block = rewriteBlockReason(command, analysis, input.platform);
  if (block) return { state: 'blocked', requested: command, executed: command, reason: block };

  if (resolution.state !== 'available' || !resolution.host || !resolution.runtime) {
    return {
      state: 'unavailable',
      requested: command,
      executed: command,
      reason: resolution.reason ?? `RTK is ${resolution.state}.`,
    };
  }

  const probe = input.probe ?? ((executable, rawCommand) => input.pi.exec(
    executable,
    ['rewrite', rawCommand],
    { timeout: input.timeoutMs ?? DEFAULT_TIMEOUT_MS },
  ));

  let result: { stdout: string; code: number };
  try {
    result = await probe(resolution.host.executablePath, command);
  } catch (error) {
    return {
      state: 'failed',
      requested: command,
      executed: command,
      reason: error instanceof Error ? error.message : String(error),
    };
  }

  if (result.code === 1) return unchanged(command, 'no rtk equivalent');
  if (result.code === 2) return { state: 'declined', requested: command, executed: command, reason: 'rtk declined' };
  if (result.code !== 0 && result.code !== 3) {
    return { state: 'failed', requested: command, executed: command, reason: `unexpected rtk exit code ${result.code}` };
  }

  const rewritten = result.stdout.trim();
  if (!rewritten || rewritten === command) return unchanged(command, 'rtk returned no change');

  const candidateAnalysis = analyzeCommand(rewritten);
  const invocations = collectRtkInvocations(candidateAnalysis.segments);
  if (!invocations || invocations.length === 0) {
    return { state: 'failed', requested: command, executed: command, reason: 'rtk output had no bindable invocation' };
  }

  for (const invocation of invocations) {
    if (!config.rewriteClasses[invocation.rewriteClass]) {
      return {
        state: 'blocked',
        requested: command,
        executed: command,
        reason: `class disabled: ${invocation.rewriteClass}`,
      };
    }
  }

  const bound = bindRtkInvocations(rewritten, candidateAnalysis.segments, invocations, resolution.runtime);
  if (isBindFailure(bound)) {
    return { state: 'failed', requested: command, executed: command, reason: bound.reason };
  }

  return { state: 'rewritten', requested: command, executed: bound.command, display: rewritten };
}

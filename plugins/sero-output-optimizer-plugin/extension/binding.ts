import type { RtkToolchainLocation } from '@sero-ai/common';

import type { AnalyzedSegment } from './command-analysis';
import type { RtkInvocation } from './rewrite-class';
import { quoteShell } from './shell';

export interface BoundCommand {
  command: string;
}

export interface BindFailure {
  reason: string;
}

function environmentPrefix(env: Record<string, string>): string {
  const entries = Object.entries(env).filter(([key, value]) => key.length > 0 && value.length > 0);
  if (entries.length === 0) return '';
  return `${entries.map(([key, value]) => `${key}=${quoteShell(value)}`).join(' ')} `;
}

/**
 * Replace every command-position `rtk` token with the verified runtime
 * executable and its per-invocation state environment.
 *
 * The rewrite is discarded when the runtime path or the environment cannot be
 * represented as a safe shell word, because a half-bound command would run a
 * binary the executing side cannot resolve.
 */
export function bindRtkInvocations(
  command: string,
  segments: AnalyzedSegment[],
  invocations: RtkInvocation[],
  runtime: RtkToolchainLocation,
): BoundCommand | BindFailure {
  if (invocations.length === 0) return { reason: 'no rtk invocation to bind' };
  if (!runtime.executablePath.trim()) return { reason: 'runtime rtk executable path is empty' };

  const prefix = `${environmentPrefix(runtime.env)}${quoteShell(runtime.executablePath)}`;
  const edits = invocations
    .map((invocation) => {
      const segment = segments[invocation.segmentIndex];
      if (!segment) return null;
      return {
        start: segment.start + invocation.rtkStart,
        end: segment.start + invocation.rtkEnd,
        replacement: prefix,
      };
    })
    .filter((edit): edit is { start: number; end: number; replacement: string } => edit !== null);

  if (edits.length !== invocations.length) {
    return { reason: 'an rtk invocation could not be located in the command' };
  }

  edits.sort((left, right) => right.start - left.start);
  let bound = command;
  for (const edit of edits) {
    bound = bound.slice(0, edit.start) + edit.replacement + bound.slice(edit.end);
  }
  return { command: bound };
}

export function isBindFailure(result: BoundCommand | BindFailure): result is BindFailure {
  return 'reason' in result;
}

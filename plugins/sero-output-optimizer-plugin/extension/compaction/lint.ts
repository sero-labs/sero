import { stripAnsi } from './ansi';
import { byteLength, countBytes } from './emitter';
import { applyPreservationGuard } from './preservation';

/**
 * Aggregate linter diagnostics by file.
 *
 * Every diagnostic line, file, line number and message is kept. Only the
 * per-line file prefix is factored into a file heading. When parsing finds no
 * diagnostics, or aggregation would not reduce the byte count, the unchanged
 * source is emitted so output is never emptied.
 */

const ISSUE_LINE = /^(.+?):(\d+)(?::(\d+))?:\s*(.+)$/;
const RULE_IN_MESSAGE = /\[([^\]]+)\]\s*$/;

interface LintIssue {
  file: string;
  line: string;
  column?: string;
  message: string;
}

interface LintAggregate {
  byFile: Map<string, LintIssue[]>;
  byRule: Map<string, number>;
  errors: number;
  warnings: number;
  count: number;
}

function aggregate(source: string): LintAggregate {
  const byFile = new Map<string, LintIssue[]>();
  const byRule = new Map<string, number>();
  let errors = 0;
  let warnings = 0;
  let count = 0;

  for (const raw of source.split('\n')) {
    const match = stripAnsi(raw).match(ISSUE_LINE);
    if (!match) continue;
    const file = match[1] ?? '';
    const message = match[4] ?? '';
    const existing = byFile.get(file) ?? [];
    existing.push({ file, line: match[2] ?? '', column: match[3], message });
    byFile.set(file, existing);
    if (/warning/i.test(message)) warnings += 1;
    else errors += 1;
    const rule = message.match(RULE_IN_MESSAGE)?.[1] ?? 'unclassified';
    byRule.set(rule, (byRule.get(rule) ?? 0) + 1);
    count += 1;
  }

  return { byFile, byRule, errors, warnings, count };
}

function* lintCandidate(agg: LintAggregate): Generator<string> {
  yield `${agg.errors} errors, ${agg.warnings} warnings in ${agg.byFile.size} files`;
  yield 'Rules:';
  const sortedRules = [...agg.byRule.entries()].sort((left, right) => right[1] - left[1]);
  for (const [rule, frequency] of sortedRules) yield `  ${rule} (${frequency})`;

  const sortedFiles = [...agg.byFile.entries()].sort(([left], [right]) => left.localeCompare(right));
  for (const [file, fileIssues] of sortedFiles) {
    yield `${file} (${fileIssues.length})`;
    for (const issue of fileIssues) {
      const location = issue.column ? `${issue.line}:${issue.column}` : issue.line;
      yield `  ${location}: ${issue.message}`;
    }
  }
}

export function emitLinterOutput(source: string, emit: (line: string) => void): boolean {
  const agg = aggregate(source);
  if (agg.count === 0 || countBytes(lintCandidate(agg)) >= byteLength(source)) {
    for (const raw of source.split('\n')) emit(stripAnsi(raw));
    return false;
  }
  for (const line of lintCandidate(agg)) emit(line);
  return true;
}

export function compactLinterOutput(source: string): string | null {
  const lines: string[] = [];
  const changed = emitLinterOutput(source, (line) => lines.push(line));
  if (!changed) return null;
  return applyPreservationGuard(source, lines.join('\n'), 'lint');
}

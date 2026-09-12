import { byteLength } from './emitter';
import { applyPreservationGuard } from './preservation';

/**
 * Aggregate linter diagnostics by file.
 *
 * Every diagnostic line, file, line number and message is kept. Only the
 * per-line file prefix is factored into a file heading.
 */

const ISSUE_LINE = /^(.+?):(\d+)(?::(\d+))?:\s*(.+)$/;
const RULE_IN_MESSAGE = /\[([^\]]+)\]\s*$/;

interface LintIssue {
  file: string;
  line: string;
  column?: string;
  message: string;
}

function parseIssues(source: string): LintIssue[] {
  const issues: LintIssue[] = [];
  for (const line of source.split('\n')) {
    const match = line.match(ISSUE_LINE);
    if (!match) continue;
    issues.push({
      file: match[1] ?? '',
      line: match[2] ?? '',
      column: match[3],
      message: match[4] ?? '',
    });
  }
  return issues;
}

export function emitLinterOutput(source: string, emit: (line: string) => void): boolean {
  const issues = parseIssues(source);
  if (issues.length === 0) return false;

  const byFile = new Map<string, LintIssue[]>();
  const byRule = new Map<string, number>();
  let errors = 0;
  let warnings = 0;

  for (const issue of issues) {
    const existing = byFile.get(issue.file) ?? [];
    existing.push(issue);
    byFile.set(issue.file, existing);
    if (/warning/i.test(issue.message)) warnings += 1;
    else errors += 1;
    const rule = issue.message.match(RULE_IN_MESSAGE)?.[1] ?? 'unclassified';
    byRule.set(rule, (byRule.get(rule) ?? 0) + 1);
  }

  const grouped: string[] = [`${errors} errors, ${warnings} warnings in ${byFile.size} files`, 'Rules:'];
  const sortedRules = [...byRule.entries()].sort((left, right) => right[1] - left[1]);
  for (const [rule, count] of sortedRules) grouped.push(`  ${rule} (${count})`);

  const sortedFiles = [...byFile.entries()].sort(([left], [right]) => left.localeCompare(right));
  for (const [file, fileIssues] of sortedFiles) {
    grouped.push(`${file} (${fileIssues.length})`);
    for (const issue of fileIssues) {
      const location = issue.column ? `${issue.line}:${issue.column}` : issue.line;
      grouped.push(`  ${location}: ${issue.message}`);
    }
  }

  // Aggregation only wins when it reduces the byte count; otherwise keep raw.
  if (byteLength(grouped.join('\n')) >= byteLength(source)) {
    for (const line of source.split('\n')) emit(line);
    return false;
  }

  for (const line of grouped) emit(line);
  return true;
}

export function compactLinterOutput(source: string): string | null {
  const lines: string[] = [];
  const changed = emitLinterOutput(source, (line) => lines.push(line));
  if (!changed) return null;
  return applyPreservationGuard(source, lines.join('\n'), 'lint');
}

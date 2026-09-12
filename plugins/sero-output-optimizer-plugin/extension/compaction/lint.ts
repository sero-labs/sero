import { applyPreservationGuard } from './preservation';

/**
 * Aggregate linter diagnostics by file.
 *
 * Every diagnostic line, file, line number and message is kept. Only the
 * per-line file prefix is factored into a file heading.
 */

const ISSUE_LINE = /^(.+?):(\d+)(?::(\d+))?:\s*(.+)$/;
const RULE_IN_MESSAGE = /\[([^\]]+)\]\s*$/;

export function compactLinterOutput(source: string): string | null {
  interface Issue {
    file: string;
    line: string;
    column?: string;
    message: string;
  }

  const issues: Issue[] = [];
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

  if (issues.length === 0) return null;

  const byFile = new Map<string, Issue[]>();
  for (const issue of issues) {
    const existing = byFile.get(issue.file) ?? [];
    existing.push(issue);
    byFile.set(issue.file, existing);
  }

  const byRule = new Map<string, number>();
  let errors = 0;
  let warnings = 0;
  for (const issue of issues) {
    if (/warning/i.test(issue.message)) warnings += 1;
    else errors += 1;
    const rule = issue.message.match(RULE_IN_MESSAGE)?.[1] ?? 'unclassified';
    byRule.set(rule, (byRule.get(rule) ?? 0) + 1);
  }

  const lines: string[] = [
    `${errors} errors, ${warnings} warnings in ${byFile.size} files`,
  ];

  const sortedRules = [...byRule.entries()].sort((left, right) => right[1] - left[1]);
  lines.push('Rules:');
  for (const [rule, count] of sortedRules) lines.push(`  ${rule} (${count})`);

  const sortedFiles = [...byFile.entries()].sort(([left], [right]) => left.localeCompare(right));
  for (const [file, fileIssues] of sortedFiles) {
    lines.push(`${file} (${fileIssues.length})`);
    for (const issue of fileIssues) {
      const location = issue.column ? `${issue.line}:${issue.column}` : issue.line;
      lines.push(`  ${location}: ${issue.message}`);
    }
  }

  const candidate = lines.join('\n');
  if (candidate.length >= source.length) return null;
  return applyPreservationGuard(source, candidate, 'lint');
}

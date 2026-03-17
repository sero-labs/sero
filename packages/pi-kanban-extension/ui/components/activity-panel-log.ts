const COMPLETION_LINE_PATTERN = /^(✅|❌)\s+(.+?)\s+(completed|failed)\s+\(([^,]+),\s+([\d,]+)\s+tokens\)$/;
const START_LINE_PATTERN = /^🔄\s+(.+?)\s+started\s+—\s+".*"$/;
const FAILURE_LINE_PATTERN = /^❌\s+(.+?)\s+failed\s+—\s+(.+)$/;
const EXPECTED_SCAFFOLD_PATTERN = /The scaffolder cancelled because existing files are present\./gi;
const EXPECTED_SCAFFOLD_WORKAROUND_PATTERN = /Let me work around this by scaffolding to a temp directory and moving files over\./gi;

function formatTokenCount(raw: string): string {
  const count = Number.parseInt(raw.replaceAll(',', ''), 10);
  if (!Number.isFinite(count)) return raw;
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(count >= 10_000_000 ? 0 : 1)}M`;
  if (count >= 10_000) return `${Math.round(count / 1_000)}k`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}k`;
  return count.toLocaleString();
}

export function formatActivityLogLine(entry: string): string {
  const trimmed = entry.trim();
  const completionMatch = trimmed.match(COMPLETION_LINE_PATTERN);
  if (completionMatch) {
    const [, prefix, agent, status, duration, tokens] = completionMatch;
    const outcome = status === 'completed' ? 'finished' : 'failed';
    return `${prefix} ${agent} ${outcome} in ${duration}, ${formatTokenCount(tokens)} tokens`;
  }

  const startMatch = trimmed.match(START_LINE_PATTERN);
  if (startMatch) {
    return `🔄 ${startMatch[1]} started`;
  }

  const failureMatch = trimmed.match(FAILURE_LINE_PATTERN);
  if (failureMatch) {
    return `❌ ${failureMatch[1]} failed: ${failureMatch[2]}`;
  }

  return trimmed;
}

export function formatLiveOutputText(entry: string): string {
  return entry
    .replace(
      EXPECTED_SCAFFOLD_PATTERN,
      'The worktree already has repo metadata, so I am scaffolding in a temporary directory instead.',
    )
    .replace(
      EXPECTED_SCAFFOLD_WORKAROUND_PATTERN,
      'This is expected for kanban worktrees; the generated files will be copied into place.',
    )
    .replace(/\*\*\*\*(?=Subtask\s+\d+:)/g, '**\n\n**')
    .replace(/([.!?])(?=[A-Z])/g, '$1 ')
    .replace(/([^\n])(?=\*\*Subtask\s+\d+:)/g, '$1\n\n')
    .replace(/(\*\*Subtask\s+\d+:[^*]+?\*\*)(?=\S)/g, '$1\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

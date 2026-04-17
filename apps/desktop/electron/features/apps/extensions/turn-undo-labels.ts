type TurnUndoLabelInput = {
  targetedPaths?: Iterable<string>;
  changedPaths?: Iterable<string>;
  promptText?: string | null;
};

const FALLBACK_LABEL = 'Undo point';
const MAX_PROMPT_LABEL_LENGTH = 120;
const MAX_PATH_SEGMENTS = 3;

function toUniquePaths(paths?: Iterable<string>): string[] {
  if (!paths) return [];

  const unique = new Set<string>();
  for (const rawPath of paths) {
    if (typeof rawPath !== 'string') continue;
    const normalized = normalizePath(rawPath);
    if (!normalized) continue;
    unique.add(normalized);
  }

  return [...unique];
}

function normalizePath(rawPath: string): string {
  return rawPath
    .trim()
    .replace(/^['"]|['"]$/g, '')
    .replace(/\\/g, '/')
    .replace(/^\.\//, '');
}

function formatPathLabel(path: string): string {
  const normalized = normalizePath(path);
  if (!normalized) return 'file';

  const parts = normalized.split('/').filter(Boolean);
  if (parts.length <= MAX_PATH_SEGMENTS) return normalized;
  return `.../${parts.slice(-MAX_PATH_SEGMENTS).join('/')}`;
}

function summarizePrompt(promptText?: string | null): string | null {
  if (typeof promptText !== 'string') return null;

  const normalized = promptText.replace(/\s+/g, ' ').trim();
  if (!normalized) return null;
  if (normalized.length <= MAX_PROMPT_LABEL_LENGTH) return normalized;
  return `${normalized.slice(0, MAX_PROMPT_LABEL_LENGTH - 1).trimEnd()}…`;
}

export function buildTurnUndoLabel({
  targetedPaths,
  changedPaths,
  promptText,
}: TurnUndoLabelInput): string {
  const uniqueTargetedPaths = toUniquePaths(targetedPaths);
  if (uniqueTargetedPaths.length === 1) {
    return `Update ${formatPathLabel(uniqueTargetedPaths[0])}`;
  }
  if (uniqueTargetedPaths.length > 1) {
    return `Update ${uniqueTargetedPaths.length} files`;
  }

  const uniqueChangedPaths = toUniquePaths(changedPaths);
  if (uniqueChangedPaths.length === 1) {
    return `Update ${formatPathLabel(uniqueChangedPaths[0])}`;
  }
  if (uniqueChangedPaths.length > 1) {
    return `Update ${uniqueChangedPaths.length} files`;
  }

  const promptSummary = summarizePrompt(promptText);
  return promptSummary || FALLBACK_LABEL;
}

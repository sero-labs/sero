/**
 * PR draft generation — prompt construction and LLM response parsing.
 *
 * Separated from IPC handlers for testability.
 */

export function buildPrDraftPrompt(
  fileSummary: string,
  patch: string,
  artifactSummary?: string | null,
): string {
  return [
    'You are generating a GitHub pull request title and description.',
    'Output only valid JSON with this exact shape: {"title":"...","body":"..."}',
    'Title requirements:',
    '- concise and specific',
    '- conventional commit style prefix (feat|fix|docs|refactor|chore|test|ci|build|perf):',
    '- max 72 characters',
    'Body requirements:',
    '- markdown',
    '- include sections: Summary, Changes, Testing',
    '- use bullet points in each section',
    '- no placeholders and no backticks around section titles',
    ...(artifactSummary
      ? [
          '- include a Verification section at the end with the agent verification evidence provided below',
        ]
      : []),
    '',
    'Changed files (status + path):',
    fileSummary || '(no file summary available)',
    '',
    'Patch (possibly truncated):',
    patch || '(no patch available)',
    ...(artifactSummary
      ? ['', 'Agent verification evidence:', artifactSummary]
      : []),
  ].join('\n');
}

export function parseDraft(raw: string): { title: string; body: string } {
  const parsedJson = tryParseDraftJson(raw);
  if (parsedJson) return parsedJson;

  const lines = raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const fallbackTitle = sanitizeTitle(lines[0] ?? 'chore: update branch changes');
  const fallbackBody = raw.trim() || 'Summary\n- Update branch changes\n\nChanges\n- See diff\n\nTesting\n- Not run';
  return { title: fallbackTitle, body: fallbackBody };
}

function tryParseDraftJson(raw: string): { title: string; body: string } | null {
  const normalized = raw.trim();
  if (!normalized) return null;

  const firstBrace = normalized.indexOf('{');
  const lastBrace = normalized.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) return null;

  const jsonSlice = normalized.slice(firstBrace, lastBrace + 1);
  try {
    const parsed = JSON.parse(jsonSlice) as { title?: unknown; body?: unknown };
    if (typeof parsed.title !== 'string' || typeof parsed.body !== 'string') return null;
    const title = sanitizeTitle(parsed.title);
    const body = parsed.body.trim();
    if (!title || !body) return null;
    return { title, body };
  } catch {
    return null;
  }
}

function sanitizeTitle(title: string): string {
  const clean = title
    .replace(/\s+/g, ' ')
    .trim();
  if (clean.length <= 72) return clean;
  return clean.slice(0, 69).trimEnd() + '...';
}

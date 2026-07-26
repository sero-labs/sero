/**
 * Commit-message drafting — prompt construction and response cleanup.
 *
 * A sibling of `pr-draft.ts` (§10), separated from the IPC handler for the same
 * reason: the parsing is where the surprises are, and it is worth testing on
 * its own.
 *
 * The message goes straight into an editable field, so this asks for the plain
 * message rather than JSON. There is nothing to destructure, and a model that
 * wraps it in prose or fences is easier to strip than one that half-emits JSON.
 */

export function buildCommitMessagePrompt(fileSummary: string, patch: string): string {
  return [
    'You are writing a git commit message for the changes below.',
    'Output only the commit message. No preamble, no code fences, no quotes.',
    'Requirements:',
    '- Conventional Commit style: type(scope): subject',
    '- type is one of feat|fix|docs|refactor|chore|test|ci|build|perf',
    '- subject is imperative mood, lower case, no trailing full stop',
    '- subject line max 72 characters',
    '- add a body only when the change needs explaining; separate it with a blank line',
    '- describe what the change does, never the fact that files changed',
    '',
    'Changed files (status + path):',
    fileSummary || '(no file summary available)',
    '',
    'Patch (possibly truncated):',
    patch || '(no patch available)',
  ].join('\n');
}

/**
 * Strips the wrappers models reach for — fences, a leading "Commit message:"
 * label, surrounding quotes — and caps the subject line.
 *
 * It deliberately does not invent a message when the model returns nothing:
 * an empty draft leaves the field alone, which is honest. A fabricated
 * "chore: update files" is worse than no suggestion, because it is plausible
 * enough to commit.
 */
export function parseCommitMessage(raw: string): string {
  const withoutFences = stripFences(raw.trim());
  const withoutLabel = withoutFences.replace(/^(?:commit\s+message|message)\s*:\s*/i, '');
  const unquoted = stripWrappingQuotes(withoutLabel.trim());

  const lines = unquoted.split('\n');
  const subject = truncateSubject((lines[0] ?? '').trim());
  if (!subject) return '';

  const body = lines.slice(1).join('\n').trim();
  return body ? `${subject}\n\n${body}` : subject;
}

function stripFences(text: string): string {
  const fenced = text.match(/^```[^\n]*\n([\s\S]*?)\n?```$/);
  return fenced?.[1]?.trim() ?? text;
}

function stripWrappingQuotes(text: string): string {
  const quoted = text.match(/^"([\s\S]*)"$/) ?? text.match(/^'([\s\S]*)'$/);
  return quoted?.[1] ?? text;
}

function truncateSubject(subject: string): string {
  if (subject.length <= 72) return subject;
  return `${subject.slice(0, 69).trimEnd()}...`;
}

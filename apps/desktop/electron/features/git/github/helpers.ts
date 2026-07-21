/** Shared GitHub helpers — the single copies of previously duplicated logic. */

export function extractGithubPrUrl(text: string): string | undefined {
  return text.match(/https:\/\/github\.com\/[^\s]+\/pull\/\d+/)?.[0];
}

export function extractPrNumber(url: string): number | undefined {
  const match = url.match(/\/pull\/(\d+)/);
  return match ? parseInt(match[1], 10) : undefined;
}

/** Extract stderr/stdout/message from a gh invocation error. */
export function ghError(err: unknown): { stderr: string; stdout: string; message: string } {
  if (err && typeof err === 'object') {
    const e = err as { stderr?: unknown; stdout?: unknown; message?: unknown };
    return {
      stderr: typeof e.stderr === 'string' ? e.stderr : '',
      stdout: typeof e.stdout === 'string' ? e.stdout : '',
      message: typeof e.message === 'string' ? e.message : String(err),
    };
  }
  return { stderr: '', stdout: '', message: String(err) };
}

/**
 * Map a gh failure to a user-facing message. The one error mapper: detects a
 * missing gh binary and missing authentication; otherwise returns the raw
 * message.
 */
export function formatGhFailure(err: unknown, fallback: string): string {
  const { stderr, stdout, message } = ghError(err);
  const detail = (stderr || stdout || message || fallback).trim();
  const lower = detail.toLowerCase();

  if (lower.includes('enoent') || lower.includes('not found') || lower.includes('cannot run gh')) {
    return 'GitHub CLI (`gh`) is not available. Install `gh` and retry.';
  }
  if (lower.includes('authentication') || lower.includes('not logged')) {
    return `${detail}\nConnect your GitHub account in Sero Settings → GitHub and retry.`;
  }
  return detail || fallback;
}

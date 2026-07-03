/**
 * `gh api` transport for the GitHub event source (spec 12 Phase 4).
 *
 * Every poll is a conditional request: the stored ETag rides in
 * `If-None-Match`, and a 304 answer costs nothing against the GitHub rate
 * limit. Rate-limit headers are surfaced so the poller can slow down before
 * hitting the wall. Auth is the user's ambient `gh` login — no tokens stored.
 * Endpoint paths use `{owner}/{repo}` placeholders, which `gh` resolves from
 * the workspace's git remote (the command runs at the workspace root).
 */

import type { OrchestratorHost } from '../host';

export interface GhApiResponse {
  /** HTTP status; 0 when the command failed before an HTTP exchange. */
  status: number;
  etag?: string;
  /** Remaining calls in the current rate-limit window, when reported. */
  rateLimitRemaining?: number;
  /** Rate-limit window reset time (epoch ms), when reported. */
  rateLimitResetMs?: number;
  /** Parsed JSON body (2xx with valid JSON only). */
  body?: unknown;
}

const COMMAND_TIMEOUT_MS = 30_000;

/** ETags are opaque quoted tokens; anything else is dropped, never shell-escaped. */
const SAFE_ETAG = /^[Ww/"A-Za-z0-9+=:._-]+$/;

/**
 * Parses `gh api --include` output. Headers arrive on stdout ahead of the
 * body; on non-2xx (including 304) `gh` exits non-zero and states the status
 * on stderr, so both channels are consulted.
 */
export function parseGhApiOutput(stdout: string, stderr: string, exitCode: number): GhApiResponse {
  let text = stdout;
  let status = 0;
  const headers: Record<string, string> = {};
  while (text.startsWith('HTTP/')) {
    const headerEnd = text.search(/\r?\n\r?\n/);
    const block = headerEnd === -1 ? text : text.slice(0, headerEnd);
    const lines = block.split(/\r?\n/);
    status = Number(lines[0].split(' ')[1]) || 0;
    for (const line of lines.slice(1)) {
      const colon = line.indexOf(':');
      if (colon > 0) headers[line.slice(0, colon).trim().toLowerCase()] = line.slice(colon + 1).trim();
    }
    text = headerEnd === -1 ? '' : text.slice(headerEnd).replace(/^\r?\n\r?\n/, '');
  }
  if (status === 0) {
    const stated = /HTTP (\d{3})/.exec(stderr);
    status = stated ? Number(stated[1]) : exitCode === 0 ? 200 : 0;
  }

  const response: GhApiResponse = { status };
  if (headers.etag) response.etag = headers.etag;
  if (headers['x-ratelimit-remaining'] !== undefined) {
    response.rateLimitRemaining = Number(headers['x-ratelimit-remaining']);
  }
  if (headers['x-ratelimit-reset'] !== undefined) {
    response.rateLimitResetMs = Number(headers['x-ratelimit-reset']) * 1000;
  }
  if (status >= 200 && status < 300 && text.trim()) {
    try {
      response.body = JSON.parse(text);
    } catch {
      // Body stays undefined; the poller treats a 2xx without a body as a failed poll.
    }
  }
  return response;
}

export async function runGhApi(host: OrchestratorHost, path: string, etag?: string): Promise<GhApiResponse> {
  const conditional = etag && SAFE_ETAG.test(etag) ? ` --header 'If-None-Match: ${etag}'` : '';
  const result = await host.runCommand(`gh api '${path}' --include${conditional}`, COMMAND_TIMEOUT_MS);
  return parseGhApiOutput(result.stdout, result.stderr, result.exitCode);
}

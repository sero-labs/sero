import path from 'node:path';
import { fileText, putFile, waitUntil } from '../files';
import type { StepContext } from '../types';

/** Where the web plugin keeps its state in a workspace (`state-sync.ts` STATE_REL_PATH). */
export const WEB_STATE_FILE = '.sero/apps/web/state.json';

export interface WebStateBookmark {
  id: string;
  url: string;
  title: string;
  description?: string;
  tags: string[];
}

export interface WebStateEntry {
  id: string;
  type: 'search' | 'fetch';
  timestamp: number;
  urls?: Array<{ url: string; title: string; charCount: number; error: string | null }>;
}

export interface WebState {
  entries: WebStateEntry[];
  bookmarks: WebStateBookmark[];
  historyClearedAt: number;
}

/** The workspace's web state file as the plugin wrote it, or an empty state when there is none yet. */
export async function readWebState(ctx: StepContext): Promise<WebState> {
  const raw = await fileText(ctx, WEB_STATE_FILE);
  const parsed = raw ? (JSON.parse(raw) as Partial<WebState>) : {};
  return {
    entries: parsed.entries ?? [],
    bookmarks: parsed.bookmarks ?? [],
    historyClearedAt: parsed.historyClearedAt ?? 0,
  };
}

/** Saves a state with the entries replaced, for a step that needs history to exist. */
export async function writeWebEntries(ctx: StepContext, entries: WebStateEntry[]): Promise<void> {
  const raw = await fileText(ctx, WEB_STATE_FILE);
  const current = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  await putFile(ctx, WEB_STATE_FILE, JSON.stringify({ ...current, entries }, null, 2));
}

/**
 * Waits for the state file to satisfy `ready`. The plugin writes history in
 * the background after a tool call returns, so an effect can lag the result.
 */
export async function waitForWebState(
  ctx: StepContext,
  describe: string,
  ready: (state: WebState) => boolean,
  timeoutMs = 10_000,
): Promise<WebState> {
  let last: WebState | undefined;
  try {
    return await waitUntil(path.dirname(path.join(ctx.workspacePath, WEB_STATE_FILE)), `the web state file to show ${describe}`, async () => {
      last = await readWebState(ctx);
      return ready(last) ? last : undefined;
    }, timeoutMs);
  } catch (error) {
    throw new Error(`the web state file never showed ${describe}: ${JSON.stringify(last).slice(0, 400)}`, { cause: error });
  }
}

/**
 * What the Graphify probes share: the planted source files, and reading and
 * waiting on the plugin's state file.
 *
 * `graphify_index` and `graphify_configure` only queue a request. The plugin's
 * background runtime applies it, so their effect shows up in the state file
 * (and in the graph files beside it) a moment later. The helpers here wait for
 * that, because the request is the whole call from the model's side.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import type { StepContext, ToolCallResult } from '../types';
import { expectText } from '../expect';
import { pageOf, putFile, waitUntil } from '../files';

/** How long a first build may take: it can download uv, Python and graphifyy first. */
export const FIRST_BUILD_WAIT_MS = 600_000;
/** How long any later request may take. */
export const REQUEST_WAIT_MS = 120_000;

/** Source the index is built from. The names are what the search steps look for. */
export const PLANTED_FILES: Record<string, string> = {
  'tc-graphify/billing.py': `"""Billing helpers planted by the tool check."""


def compute_invoice_total(items):
    subtotal = sum(item["price"] for item in items)
    return apply_discount_rule(subtotal)


def apply_discount_rule(amount):
    return amount * 0.9


class LedgerArchiver:
    def archive_entry(self, items):
        return compute_invoice_total(items)

    def close_period(self):
        return self.archive_entry([])
`,
  'tc-graphify/report.py': `from billing import LedgerArchiver


def render_quarter_report(items):
    archiver = LedgerArchiver()
    return archiver.archive_entry(items)
`,
};

/** A function added after the first build, for the refresh step to find. */
export const ADDED_FUNCTION = 'late_fee_penalty';

export async function plantSources(ctx: StepContext): Promise<void> {
  for (const [file, content] of Object.entries(PLANTED_FILES)) await putFile(ctx, file, content);
}

export interface WorkspaceEntry {
  workspaceId: string;
  name: string;
  path: string;
  enabled: boolean;
  status: string;
  lastBuiltAt?: string;
  lastError?: string;
  stats?: { nodes: number; edges: number; inputTokens: number; outputTokens: number };
}

/** The parts of the plugin's state file the steps read. */
export interface GraphifyStateFile {
  settings?: { paused?: boolean; exclude?: string[] };
  provisioning?: { status?: string; version?: string; availableVersion?: string; error?: string };
  workspaces?: Record<string, WorkspaceEntry>;
  profileGraph?: { status?: string; mergedAt?: string; workspaceIds?: string[]; nodes?: number; error?: string };
  requests?: unknown[];
  notice?: unknown;
}

/** The plugin's folder in the profile the app runs on: `state.json`, `graphs/` and `profile/`. */
export async function graphifyDir(ctx: StepContext): Promise<string> {
  if (typeof ctx.state.graphifyDir === 'string') return ctx.state.graphifyDir;
  const profile = await pageOf(ctx).evaluate(() => window.sero.profiles.getActive());
  if (!profile) throw new Error('the app has no active profile');
  const dir = path.join(profile.path, 'apps', 'graphify');
  ctx.state.graphifyDir = dir;
  return dir;
}

export async function readGraphifyState(ctx: StepContext): Promise<GraphifyStateFile | null> {
  try {
    return JSON.parse(await fs.readFile(path.join(await graphifyDir(ctx), 'state.json'), 'utf8')) as GraphifyStateFile;
  } catch {
    // Missing, or caught between the runtime's write and rename.
    return null;
  }
}

export async function readGraphifyFile(ctx: StepContext, ...relative: string[]): Promise<string | null> {
  return fs.readFile(path.join(await graphifyDir(ctx), ...relative), 'utf8').catch(() => null);
}

export function workspaceOf(state: GraphifyStateFile | null, ctx: StepContext): WorkspaceEntry | undefined {
  return state?.workspaces?.[ctx.workspaceId];
}

/** A problem that will not clear by waiting longer, or undefined. */
function unrecoverable(state: GraphifyStateFile, ctx: StepContext): string | undefined {
  if (state.provisioning?.status === 'failed') return `Graphify could not install: ${state.provisioning.error ?? 'no reason given'}`;
  const entry = workspaceOf(state, ctx);
  if (entry?.status === 'error') return `indexing the workspace failed: ${entry.lastError ?? 'no reason given'}`;
  if (state.profileGraph?.status === 'failed') return `merging the profile graph failed: ${state.profileGraph.error ?? 'no reason given'}`;
  return undefined;
}

/** Waits until `ready` holds for the state file, and returns that state. Throws on a failure that will not clear. */
export async function waitForGraphify(
  ctx: StepContext,
  what: string,
  ready: (state: GraphifyStateFile) => boolean,
  timeoutMs = REQUEST_WAIT_MS,
): Promise<GraphifyStateFile> {
  const seen: { state: GraphifyStateFile | null } = { state: null };
  let fatal: Error | undefined;
  try {
    return await waitUntil(await graphifyDir(ctx), what, async () => {
      const current = await readGraphifyState(ctx);
      seen.state = current;
      if (!current) return undefined;
      const problem = unrecoverable(current, ctx);
      if (problem) {
        fatal = new Error(`while waiting for ${what}, ${problem}`);
        throw fatal;
      }
      return ready(current) ? current : undefined;
    }, timeoutMs);
  } catch (error) {
    if (error === fatal) throw error;
    const last = seen.state;
    const summary = last ? JSON.stringify({ provisioning: last.provisioning, workspace: workspaceOf(last, ctx), profileGraph: last.profileGraph, requests: last.requests?.length }) : 'no state file';
    throw new Error(`gave up after ${Math.round(timeoutMs / 1000)} s waiting for ${what}: ${summary}`, { cause: error });
  }
}

/** True when no workspace is queued or being indexed. */
export function indexingIdle(state: GraphifyStateFile): boolean {
  return Object.values(state.workspaces ?? {}).every((entry) => !['queued', 'building', 'updating'].includes(entry.status));
}

/** Checks a queued-request reply: `Queued <what> (request #n)`. */
export function expectQueued(result: ToolCallResult, what: string): void {
  expectText(result, `Queued ${what} (request #`);
}

/** The search steps need the graph the index probe built. Fails with a pointer when it is not there. */
export async function requireBuiltGraph(ctx: StepContext): Promise<void> {
  const state = await readGraphifyState(ctx);
  if (state?.profileGraph?.status !== 'ready') {
    throw new Error('no profile graph is built: run the graphify_index probe first (SERO_TOOL_CHECK_ONLY must list it before this tool)');
  }
}

/** Fails when a graph tool answered with its own error text, which it returns without the error flag. */
export function expectAnswer(result: ToolCallResult, ...fragments: string[]): void {
  for (const fragment of fragments) expectText(result, fragment);
  if (/^Error:/.test(result.text)) throw new Error(`the tool reported an error: ${result.text}`);
}

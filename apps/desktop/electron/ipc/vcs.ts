import { BrowserWindow, ipcMain } from 'electron';

import { IpcChannels } from '../../src/types/ipc';
import type { CreatePullRequestInput, PullRequestDraft } from '../../src/types/vcs';
import { runAdhocAgent } from '../agents/adhoc-agent';
import { vcsManager, vcsOps, vcsPrOps, workspaceManager } from './shared-infra';

const Ch = IpcChannels.vcs;

function broadcast(event: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(Ch.event, event);
  }
}

let subscribed = false;

export function registerVcsHandlers(): void {
  if (!subscribed) {
    subscribed = true;
    vcsManager.on('event', (event) => broadcast(event));
  }

  // ── Existing checkpoint handlers ──────────────────────────

  ipcMain.handle(Ch.list, async (_e, wsId: string, limit?: number) =>
    vcsManager.listCheckpoints(wsId, limit ?? 40),
  );

  ipcMain.handle(Ch.state, async (_e, wsId: string, limit?: number) =>
    vcsManager.getWorkspaceState(wsId, limit ?? 40),
  );

  ipcMain.handle(Ch.create, async (_e, wsId: string, desc?: string, src?: string) =>
    vcsManager.createCheckpoint(wsId, { source: (src as 'manual') ?? 'manual', description: desc }),
  );

  ipcMain.handle(Ch.restore, async (_e, wsId: string, id: string) =>
    vcsManager.restoreCheckpoint(wsId, id),
  );

  ipcMain.handle(Ch.diff, async (_e, wsId: string, from: string, to?: string) =>
    vcsManager.diff(wsId, from, to),
  );

  ipcMain.handle(Ch.watch, async (_e, wsId: string) => vcsManager.watchWorkspace(wsId));
  ipcMain.handle(Ch.unwatch, async (_e, wsId: string) => vcsManager.unwatchWorkspace(wsId));

  // ── Rich VCS ops ──────────────────────────────────────────

  ipcMain.handle(Ch.logEntries, async (_e, wsId: string, limit?: number, revset?: string) =>
    vcsOps.getLogEntries(wsId, limit ?? 40, revset),
  );

  ipcMain.handle(Ch.status, async (_e, wsId: string) =>
    vcsOps.getStatus(wsId),
  );

  ipcMain.handle(Ch.fileDiffSummary, async (_e, wsId: string, from: string, to?: string) =>
    vcsOps.getFileDiffSummary(wsId, from, to),
  );

  ipcMain.handle(Ch.fileContent, async (_e, wsId: string, rev: string, path: string) =>
    vcsOps.getFileContent(wsId, rev, path),
  );

  ipcMain.handle(Ch.describe, async (_e, wsId: string, changeId: string, msg: string) =>
    vcsOps.describeChange(wsId, changeId, msg),
  );

  ipcMain.handle(Ch.bookmarks, async (_e, wsId: string) =>
    vcsOps.listBookmarks(wsId),
  );

  ipcMain.handle(Ch.createBookmark, async (_e, wsId: string, name: string, rev?: string) =>
    vcsOps.createBookmark(wsId, name, rev),
  );

  ipcMain.handle(Ch.deleteBookmark, async (_e, wsId: string, name: string) =>
    vcsOps.deleteBookmark(wsId, name),
  );

  ipcMain.handle(Ch.moveBookmark, async (_e, wsId: string, name: string, toRev: string) =>
    vcsOps.moveBookmark(wsId, name, toRev),
  );

  ipcMain.handle(Ch.remotes, async (_e, wsId: string) =>
    vcsOps.listRemotes(wsId),
  );

  ipcMain.handle(Ch.addRemote, async (_e, wsId: string, name: string, url: string) =>
    vcsOps.addRemote(wsId, name, url),
  );

  ipcMain.handle(Ch.removeRemote, async (_e, wsId: string, name: string) =>
    vcsOps.removeRemote(wsId, name),
  );

  ipcMain.handle(Ch.fetch, async (_e, wsId: string, remote?: string) =>
    vcsOps.fetch(wsId, remote),
  );

  ipcMain.handle(Ch.push, async (_e, wsId: string, bookmark?: string, changeId?: string) =>
    vcsOps.push(wsId, bookmark, changeId),
  );

  ipcMain.handle(Ch.pushDryRun, async (_e, wsId: string, bookmark?: string, changeId?: string) =>
    vcsOps.pushDryRun(wsId, bookmark, changeId),
  );

  // ── Pull request workflow ────────────────────────────────

  ipcMain.handle(Ch.prState, async (_e, wsId: string) =>
    vcsPrOps.getState(wsId),
  );

  ipcMain.handle(Ch.prPreview, async (_e, wsId: string, sourceBranch?: string, targetBranch?: string) =>
    vcsPrOps.preview(wsId, sourceBranch, targetBranch),
  );

  ipcMain.handle(Ch.prGenerateDraft, async (_e, wsId: string, sourceBranch: string, targetBranch?: string) => {
    const workspacePath = workspaceManager.getPath(wsId);
    if (!workspacePath) throw new Error(`Workspace not found: ${wsId}`);

    const ctx = await vcsPrOps.buildDraftContext(wsId, sourceBranch, targetBranch);
    const prompt = buildPrDraftPrompt(ctx.fileSummary, ctx.patch);
    const generated = await runAdhocAgent(workspacePath, prompt, 'low');
    const parsed = parseDraft(generated.text);

    const draft: PullRequestDraft = {
      ...ctx.preview,
      title: parsed.title,
      body: parsed.body,
      model: generated.model,
    };
    return draft;
  });

  ipcMain.handle(Ch.prCreate, async (_e, wsId: string, input: CreatePullRequestInput) =>
    vcsPrOps.create(wsId, input),
  );

  ipcMain.handle(Ch.undo, async (_e, wsId: string) => vcsOps.undo(wsId));

  ipcMain.handle(Ch.abandon, async (_e, wsId: string, changeId: string) =>
    vcsOps.abandon(wsId, changeId),
  );

  ipcMain.handle(Ch.squash, async (_e, wsId: string, from?: string, into?: string) =>
    vcsOps.squash(wsId, from, into),
  );

  ipcMain.handle(Ch.opLog, async (_e, wsId: string, limit?: number) =>
    vcsOps.getOperationLog(wsId, limit ?? 20),
  );
}

export { Ch as VcsChannels };

function buildPrDraftPrompt(fileSummary: string, patch: string): string {
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
    '',
    'Changed files (status + path):',
    fileSummary || '(no file summary available)',
    '',
    'Patch (possibly truncated):',
    patch || '(no patch available)',
  ].join('\n');
}

function parseDraft(raw: string): { title: string; body: string } {
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

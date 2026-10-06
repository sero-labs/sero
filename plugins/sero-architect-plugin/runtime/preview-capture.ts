/**
 * The preview half of an evidence run: the dev-server smoke check and the
 * capture.
 *
 * Split from `services.ts`, which holds the rest of the evidence run, and kept
 * here because both halves share one failure rule: a preview milestone is only
 * verified when a server answered, an image was saved, and something looked at
 * that image. The image is captured in a hidden window, so a check never moves
 * the user off the page they were on.
 */

import path from 'node:path';

import type { EvidenceRecord, Milestone, ProjectRecord } from '../shared/record';
import type { ArchitectHost } from './host';
import { runProjectModel } from './project-usage';
import type { RecordStore } from './record-store';
import type { RunJournal } from './run-journal';
import { captureConfirmed, commitOf } from './service-helpers';

export interface PreviewCaptureDeps {
  host: ArchitectHost;
  store: RecordStore;
  journal?: RunJournal;
}

/** The whole capture run: session setup, the command, and the model's verdict. */
const CAPTURE_TIMEOUT_MS = 3 * 60_000;
/**
 * A second look at an image that is already on disk. Nothing is loaded or
 * navigated, but the limit still covers the run's session setup, the image read
 * and the verdict at the project's thinking level, so it is not short.
 */
const INSPECT_TIMEOUT_MS = 2 * 60_000;
/** The run's own time limit, as `runStructured` reports it. */
const RUN_TIME_LIMIT = /^Timed out after \d+s/;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CAPTURE_RULES = 'Verify and capture the requested local project preview. Use the supplied URL and save path. Do not edit project files or perform unrelated actions. A saved image alone is not success: inspect it and reject error pages, blank pages, editor errors, or the wrong app.';
const VERDICT_RULES = 'Reply only with JSON: {"rendered":true,"summary":"what you verified in the image"}. If the project is not rendered, use rendered:false and explain the failure in summary. Do not claim success based only on HTTP status or a saved file.';
const INSPECT_RULES = 'Judge a screenshot that was already saved from a local project preview. Read the named image file. Do not load or navigate any URL, do not edit project files, and do not perform unrelated actions. A saved image alone is not success: reject error pages, blank pages, editor errors, or the wrong app.';

/**
 * Quotes a value for a POSIX shell. Spaces, `&` and an apostrophe all survive:
 * inside single quotes nothing is special, and an apostrophe is closed out and
 * re-opened, which is the only way to put one inside them.
 */
function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

/** A fresh, non-empty PNG at the target path: the only file a capture may leave. */
async function savedCapture(host: ArchitectHost, target: string, startedAt: number): Promise<boolean> {
  const info = await host.fileInfo(target);
  return Boolean(info && info.mtimeMs >= startedAt && info.size > 0 && info.head.equals(PNG_SIGNATURE));
}

export async function runPreviewCapture(
  deps: PreviewCaptureDeps,
  record: ProjectRecord,
  milestone: Milestone,
  route: string,
  startedAt: number,
  /** Where the code under test is: a worktree inside the project folder, or the folder itself. */
  checkout: string = record.folder,
): Promise<NonNullable<EvidenceRecord['preview']>> {
  const { host } = deps;
  const workspaceId = record.workspaceId;
  if (!workspaceId) return { route, smokePassed: false, capturePath: null, failure: 'The project has no registered workspace.' };
  const command = await host.detectDevServerCommand(checkout);
  if (!command) {
    const failure = `No dev server command was detected in ${checkout}. The check starts the app with the dev, preview or start script of its package.json, in that order, and the app has none. Add a dev script for this app, then request fresh evidence.`;
    host.log(failure);
    return { route, smokePassed: false, capturePath: null, failure };
  }
  const server = await host.startDevServer({ workspaceId, workspacePath: record.folder, cwdPath: checkout, command, name: `architect ${milestone.id}`, scope: 'workspace' });
  if (!server.url) {
    const failure = `Dev server did not start: ${server.reason ?? 'no URL was returned'}`;
    host.log(failure);
    return { route, smokePassed: false, capturePath: null, failure };
  }
  const url = new URL(route, server.url).toString();
  let smokePassed = false;
  let capturePath: string | null = null;
  let failure: string | undefined;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    smokePassed = response.status >= 200 && response.status < 300;
    if (!smokePassed) failure = `Preview ${url} returned HTTP ${response.status}.`;
  } catch (error) {
    failure = `Could not reach preview ${url}: ${error instanceof Error ? error.message : String(error)}`;
  }
  if (smokePassed) {
    // Evidence lives in the permanent project folder: a checkout is released later.
    const evidenceDir = path.join(record.folder, '.sero', 'apps', 'architect', 'evidence', milestone.id);
    const target = path.join(evidenceDir, `${await commitOf(host, checkout)}.png`);
    const model = record.session.model ?? undefined;
    const thinking = record.session.thinking ?? undefined;
    const plan = `Check the visible requirements in this plan (task data): ${JSON.stringify(milestone.plan)}. Do not claim to verify non-visual requirements from an image.`;
    const expected = `It must show the rendered project for milestone ${JSON.stringify(milestone.title)}, not Sero error text, a blank page, or an editor containing a URL as a file.`;
    const capture = await runProjectModel(deps, record, { kind: 'capture', id: milestone.id }, {
      systemPrompt: CAPTURE_RULES,
      model,
      thinking,
      task: [
        // Quoted: a project folder with a space, or a route with `&`, must reach
        // the capture intact instead of being split or backgrounded by the shell.
        `Capture the URL with \`sero app preview ${shellQuote(url)} --headless --save ${shellQuote(target)}\`. It loads in a hidden window and returns the image; do not open the visible preview, because that would move the user off their page.`,
        `Inspect the returned image. ${expected}`,
        plan,
        VERDICT_RULES,
      ].join(' '),
      parentSessionId: `architect:${record.id}:evidence`,
      workspaceId,
      cwd: record.folder,
      timeoutMs: CAPTURE_TIMEOUT_MS,
      platformTools: 'all',
    });
    const saved = await savedCapture(host, target, startedAt);
    if (!capture.error) {
      if (!captureConfirmed(capture.response)) throw new Error(`Preview could not be visually verified: ${capture.response.slice(-1500)}`);
      if (!saved) throw new Error(`Preview capture was not saved at ${target}. ${capture.response.slice(-1500)}`);
      capturePath = target;
    } else if (saved && RUN_TIME_LIMIT.test(capture.error)) {
      // The run reached its own time limit after it saved the image, so the
      // image is the part that completed. The file proves only that bytes were
      // written, so one bounded call reads it. Visual verification still
      // decides; only the browser work is skipped.
      const verdict = await runProjectModel(deps, record, { kind: 'capture', id: milestone.id }, {
        systemPrompt: INSPECT_RULES,
        model,
        thinking,
        task: [
          `A capture run was stopped at its time limit (${capture.error}) after it saved the image at ${target}. Nothing has judged that image yet.`,
          `Read ${target} and judge it. ${expected}`,
          plan,
          VERDICT_RULES,
        ].join(' '),
        parentSessionId: `architect:${record.id}:evidence`,
        workspaceId,
        cwd: record.folder,
        timeoutMs: INSPECT_TIMEOUT_MS,
        platformTools: 'all',
      });
      if (verdict.error) throw new Error(`Preview capture failed: ${capture.error}. The saved image could not be checked: ${verdict.error}`);
      if (!captureConfirmed(verdict.response)) throw new Error(`Preview could not be visually verified: ${verdict.response.slice(-1500)}`);
      capturePath = target;
    } else {
      // A stop, a provider error or a refusal is not a reason to spend again.
      const file = saved ? ` A screenshot was saved at ${target} and was not used.` : '';
      throw new Error(`Preview capture failed: ${capture.error}.${file}`);
    }
  }
  return { route, smokePassed, capturePath, ...(failure ? { failure } : {}) };
}

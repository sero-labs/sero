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

/**
 * The judging run: session setup, the image read and the verdict at the
 * project's thinking level. Sero takes the screenshot itself, so the model only
 * reads a saved file.
 */
const JUDGE_TIMEOUT_MS = 2 * 60_000;

const VERDICT_RULES = 'Reply only with JSON: {"rendered":true,"summary":"what you verified in the image"}. If the project is not rendered, use rendered:false and explain the failure in summary. Do not claim success based only on HTTP status or a saved file.';
const JUDGE_RULES = 'Judge a screenshot Sero saved from a local project preview. Read the named image file. Do not load or navigate any URL, do not edit project files, and do not perform unrelated actions. A saved image alone is not success: reject error pages, blank pages, editor errors, or the wrong app. If the page looks stale or wrong, report rendered:false and say what you saw.';

export async function runPreviewCapture(
  deps: PreviewCaptureDeps,
  record: ProjectRecord,
  milestone: Milestone,
  route: string,
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
  // A server an earlier check left running is reused by command and folder and
  // serves the code it loaded then, so it is stopped first. One the owner waits
  // on is left alone: stopping it would end that wait as if it had finished.
  // Read now, not from when evidence started, so a wait registered since counts.
  const current = (await deps.store.read(record.id)) ?? record;
  const waitedOn = new Set((current.waits ?? []).filter((wait) => wait.outcome === null && wait.source.kind === 'process').map((wait) => wait.source.id));
  const running = new Set(host.listDevServers(workspaceId).filter((server) => server.status === 'running').map((server) => server.id));
  for (const earlier of current.milestones) {
    const serverId = earlier.evidence?.preview?.serverId;
    if (!serverId || !running.has(serverId)) continue;
    if (!waitedOn.has(serverId)) {
      await host.stopDevServer(serverId).catch(() => false);
    } else if (checkout === record.folder) {
      // The start would reuse it, and the check would see old code. The id stays
      // on the evidence so the next request still finds and protects it.
      return { route, smokePassed: false, capturePath: null, failure: `The preview would reuse dev server ${serverId}, which you are waiting on, and check the code it loaded then. Let that wait end, then request evidence again.`, serverId };
    }
  }
  const server = await host.startDevServer({ workspaceId, workspacePath: record.folder, cwdPath: checkout, command, name: `architect ${milestone.id}`, scope: 'workspace' });
  if (!server.url) {
    const failure = `Dev server did not start: ${server.reason ?? 'no URL was returned'}`;
    host.log(failure);
    return { route, smokePassed: false, capturePath: null, failure };
  }
  // In the project folder the server keeps running, so the owner can wait on it,
  // and the next check can stop it even when this capture fails.
  const keptRunning = checkout === record.folder && server.serverId ? { serverId: server.serverId } : {};
  try {
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
      // Sero takes the screenshot in a hidden window, so the model never runs a
      // command and cannot touch the preview server or start its own.
      const shot = await host.capturePreview(url, target);
      if (!shot.ok) throw new Error(`Preview capture failed: ${shot.error}`);
      const verdict = await runProjectModel(deps, record, { kind: 'capture', id: milestone.id }, {
        systemPrompt: JUDGE_RULES,
        model: record.session.model ?? undefined,
        thinking: record.session.thinking ?? undefined,
        task: [
          `Sero saved a screenshot of ${url} at ${target}.`,
          `Read ${target} and judge it. It must show the rendered project for milestone ${JSON.stringify(milestone.title)}, not Sero error text, a blank page, or an editor containing a URL as a file.`,
          `Check the visible requirements in this plan (task data): ${JSON.stringify(milestone.plan)}. Do not claim to verify non-visual requirements from an image.`,
          VERDICT_RULES,
        ].join(' '),
        parentSessionId: `architect:${record.id}:evidence`,
        workspaceId,
        cwd: record.folder,
        timeoutMs: JUDGE_TIMEOUT_MS,
        platformTools: 'readOnly',
      });
      if (verdict.error) throw new Error(`The saved screenshot at ${target} could not be checked: ${verdict.error}`);
      if (!captureConfirmed(verdict.response)) throw new Error(`Preview could not be visually verified: ${verdict.response.slice(-1500)}`);
      capturePath = target;
    }
    return { route, smokePassed, capturePath, ...(failure ? { failure } : {}), ...keptRunning };
  } catch (error) {
    return { route, smokePassed: false, capturePath: null, failure: error instanceof Error ? error.message : String(error), ...keptRunning };
  } finally {
    // A checkout is released and restored later. A server left running would be reused
    // by command and directory, and could serve the code it loaded before.
    if (checkout !== record.folder && server.serverId) await host.stopDevServer(server.serverId).catch(() => false);
  }
}

/**
 * Builds the concrete OrchestratorHost from the desktop AppRuntimeContext.
 *
 * The plugin's runtime logic depends only on OrchestratorHost (host.ts), so
 * unit tests can swap in a fake. This adapter is the single place that touches
 * the real `ctx.host` seams.
 */

import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createFeedbackProjection, openRunFeedback, sessionStartedAt, type AppRuntimeContext } from '@sero-ai/common';
import type { OrchestratorHost } from './host';
import type { LiveCallNotice, LiveCallUpdate } from '../shared/types';
import { liveCallKey } from '../shared/live-call-types';
import type { RoomMemberLiveNotice } from '../shared/room-live-types';
import { createCatalogStore } from './catalog-store';
import { createLoopStore } from './loop-store';
import { createLibraryStore } from './library-store';

/** The topic this app's views subscribe to for work feedback. */
export const ORCHESTRATOR_FEEDBACK_TOPIC = 'orchestrator-feedback';

/**
 * Resolves `relativePath` under `baseDir` and confirms the result stays inside
 * it — an artifact path must never escape the state dir (defence-in-depth on top
 * of step-id slug validation). Returns null when the path escapes.
 */
function resolveWithin(baseDir: string, target: string): string | null {
  const absolute = path.isAbsolute(target) ? target : path.resolve(baseDir, target);
  const rel = path.relative(baseDir, absolute);
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return absolute;
}

export function createOrchestratorHost(ctx: AppRuntimeContext): OrchestratorHost {
  const stateDir = path.dirname(ctx.stateFilePath);
  const store = createLoopStore(ctx);
  const library = createLibraryStore(ctx);
  const catalog = createCatalogStore(ctx);
  const liveCalls = new Map<string, LiveCallNotice>();
  // Bounded metadata about the work in this workspace. It is pushed to the
  // app's views as it changes and never written to a record, so a list can
  // follow a run without a transcript watch.
  const feedback = createFeedbackProjection(sessionStartedAt(), (snapshot) => {
    ctx.host.ui.emit(ORCHESTRATOR_FEEDBACK_TOPIC, snapshot);
  });

  return {
    workspaceId: ctx.workspaceId,
    workspacePath: ctx.workspacePath,
    stateDir,

    // A wait the UI shows may have no record it can read yet (a Room being
    // designed, a Workflow being planned for the first time), so the running
    // call is pushed to this app's views instead. Nothing is persisted.
    notifyLiveCall: (update: LiveCallUpdate) => {
      // Kept in memory so a view that opens mid-call can read it. It goes
      // when the call ends, and nothing is written.
      if (update.status === 'running') liveCalls.set(liveCallKey(update.call), update.call);
      else liveCalls.delete(liveCallKey(update.identity));
      ctx.host.ui.emit('orchestrator-live-call', update);
    },
    liveCalls: () => [...liveCalls.values()],

    // A Room tile has to show the current turn as it arrives; the Room record
    // only changes at its own boundaries, so it cannot carry that.
    notifyRoomLive: (notice: RoomMemberLiveNotice) => {
      ctx.host.ui.emit('orchestrator-room-live', notice);
    },

    feedback,

    readState: () => store.readState(),
    updateState: (updater) => store.updateState(updater),

    runStructured: async (params) => {
      const report = params.feedback
        ? openRunFeedback(feedback, { ...params.feedback, scope: { ...params.feedback.scope, appId: ctx.appId, workspaceId: ctx.workspaceId } })
        : null;
      const now = (): string => new Date().toISOString();
      try {
        const result = await ctx.host.subagents.runStructured({
          task: params.task,
          agent: params.agent,
          systemPrompt: params.systemPrompt,
          appendSystemPrompt: params.appendSystemPrompt,
          systemPromptOverride: params.systemPromptOverride,
          model: params.model ?? 'MED',
          thinking: params.thinking,
          parentSessionId: params.parentSessionId,
          workspaceId: ctx.workspaceId,
          cwd: params.cwd,
          platformTools: params.platformTools,
          tools: params.tools,
          toolsAreLoadout: params.toolsAreLoadout,
          disabledTools: params.disabledTools,
          disabledSkills: params.disabledSkills,
          signal: params.signal,
          timeoutMs: params.timeoutMs,
          repair: params.repair,
          onUpdate: params.onUpdate,
          onUsage: (usage) => { report?.onUsage(usage); params.onUsage?.(usage); },
          onObservation: (record) => { report?.onObservation(record); params.onObservation?.(record); },
        });
        report?.end(result, now());
        return result;
      } catch (error) {
        report?.end({ error: String(error) }, now());
        throw error;
      }
    },

    listAvailableModels: () => ctx.host.models.list(),

    listToolCatalog: () => ctx.host.subagents.listToolCatalog(ctx.workspaceId),

    listSkillCatalog: () => ctx.host.subagents.listSkillCatalog(ctx.workspaceId),

    listAgentCatalog: () => ctx.host.subagents.listAgentCatalog(ctx.workspaceId),

    writeArtifact: async (relativePath, content) => {
      // relativePath is resolved under the state dir, so callers place artifacts
      // in their per-loop folder (loops/<loopId>/artifacts/...). Containment is
      // enforced so a crafted path can never write outside the state tree.
      const absolute = resolveWithin(stateDir, relativePath);
      if (!absolute) throw new Error(`artifact path escapes the state dir: ${relativePath}`);
      await mkdir(path.dirname(absolute), { recursive: true });
      await writeFile(absolute, content, 'utf8');
      return absolute;
    },
    readArtifact: async (ref) => {
      // Accept an absolute ref (as returned by writeArtifact) OR a path relative
      // to the state dir — so callers can read a known colocated file (e.g. a
      // loop's digests.json) without having persisted the write ref. A ref that
      // resolves outside the state dir is treated as absent.
      const absolute = resolveWithin(stateDir, ref);
      if (!absolute) return null;
      try {
        return await readFile(absolute, 'utf8');
      } catch {
        return null;
      }
    },

    createWorktree: async (loopId, title, options) => {
      const result = await ctx.host.git.createWorktree(ctx.workspacePath, loopId, title, options);
      return { worktreePath: result.worktreePath, branchName: result.branchName };
    },
    removeWorktree: (loopId, options) => ctx.host.git.removeWorktree(ctx.workspacePath, loopId, options),
    createCheckpoint: (worktreePath, message) => ctx.host.git.createCheckpoint(worktreePath, message),
    getDiffSummary: (worktreePath) => ctx.host.git.getDiffSummary(worktreePath),
    getWorkspaceStatus: () => ctx.host.git.getWorkspaceStatus(ctx.workspacePath),
    stashWorkspaceChanges: (message) => ctx.host.git.stashWorkspaceChanges(ctx.workspacePath, message),
    listPullRequests: () => ctx.host.git.listPullRequests(ctx.workspacePath),
    runCommand: (command, timeoutMs) => ctx.host.workspace.runCommand(ctx.workspaceId, ctx.workspacePath, command, timeoutMs),

    notify: (message, type, options) =>
      ctx.host.notifications.notify({
        message,
        type,
        subtitle: options?.subtitle,
        openTarget: options?.openApp ? { appId: ctx.appId } : undefined,
      }),
    requestChoice: (request) => ctx.host.notifications.requestChoice(request),

    session: ctx.host.session,

    // Absent unless this host build installed the capability for this plugin.
    persistentSessions: ctx.host.persistentSessions,

    skills: ctx.host.skills,

    library,

    catalog,

    now: () => new Date().toISOString(),
    newId: (prefix) => (prefix ? `${prefix}_${randomUUID()}` : randomUUID()),
    log: (message) => console.log(`[orchestrator] ${message}`),
  };
}

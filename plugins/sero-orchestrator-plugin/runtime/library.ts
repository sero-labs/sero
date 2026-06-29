/**
 * Host-dependent Loop Library transform: instantiate a fresh loop instance from
 * a saved definition. See specs/08-loop-library.md. The pure `toSharedDefinition`
 * (no host) lives in shared/library.ts.
 */

import { loopParentSessionId } from '../shared/ids';
import type { Loop, LoopLibraryLink, SharedLoopDefinition } from '../shared/types';
import type { OrchestratorHost } from './host';
import { materializeTriggers, mergeWorkspaceSettings } from './loop-factory';

/**
 * Builds a fresh draft Loop in the host's workspace from a library definition,
 * linked to the version it came from. Everything that identifies one running
 * instance is minted new: id, parent session, runtime, and triggers (with zeroed
 * counters); history starts empty. Workspace isolation is a per-workspace choice,
 * so it starts at the workspace defaults (not carried in the definition).
 */
export function instantiate(host: OrchestratorHost, def: SharedLoopDefinition, link: LoopLibraryLink): Loop {
  const id = host.newId('loop');
  const now = host.now();
  return {
    id,
    workspaceId: host.workspaceId,
    title: def.title,
    prompt: def.prompt,
    summary: def.summary,
    status: 'draft',
    workspace: mergeWorkspaceSettings(),
    plan: structuredClone(def.plan),
    runtime: {
      parentSessionId: loopParentSessionId(host.workspaceId, id),
      variables: {},
      stepStates: {},
      workspace: {},
    },
    triggers: materializeTriggers(host, id, def.triggers),
    limits: { ...def.limits },
    logPolicy: { ...def.logPolicy },
    contextOverrides: def.contextOverrides ? structuredClone(def.contextOverrides) : undefined,
    warnings: [],
    runs: [],
    revisions: [],
    insights: [],
    suggestions: [],
    answeredInputs: [],
    libraryLink: link,
    createdAt: now,
    updatedAt: now,
  };
}

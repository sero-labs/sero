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
 * counters); history starts empty. Workspace isolation is a per-workspace choice
 * and starts at the workspace defaults (not carried in the definition) — EXCEPT
 * when the definition explicitly delivers files into the workspace
 * (workspace-files / saved-artifact): running those in a managed worktree hides
 * every result in a branch the user never looks at (found by the catalog e2e:
 * "Daily note" completed daily while its notes landed in .sero/worktrees/…).
 * The reverse of the placement⇒delivery derivation applies instead: a
 * file-delivering definition instantiates at the workspace root.
 */
const FILE_DELIVERY = new Set(['workspace-files', 'saved-artifact']);

/**
 * The placement override a definition forces: file-delivering definitions run
 * at the workspace root (see the note above), everything else keeps the
 * workspace/user choice. Shared with the library version switch, which must
 * apply the same rule when a version change swaps the delivery.
 */
export function fileDeliveryPlacement(def: SharedLoopDefinition): { useManagedWorktree: false } | undefined {
  const deliversFiles = def.delivery !== undefined && FILE_DELIVERY.has(def.delivery.destination);
  return deliversFiles ? { useManagedWorktree: false } : undefined;
}

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
    workspace: mergeWorkspaceSettings({
      ...fileDeliveryPlacement(def),
      // Definitional, like delivery (spec 15): the branch source travels with
      // the definition; absent means the default fresh-branch behavior.
      worktreeBranchSource: def.worktreeBranchSource,
    }),
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
    delivery: def.delivery ? structuredClone(def.delivery) : undefined,
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

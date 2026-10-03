/**
 * The coordinator registries, split from the contract to keep each file within
 * the 500-LOC limit. The shapes they carry live in `orchestrator-contract.ts`;
 * this file is only how a caller in Electron main reaches a coordinator.
 */

import type {
  OrchestratorBoardAction,
  OrchestratorBoardActionResult,
  OrchestratorDeliveryDestinationId,
  OrchestratorRoomStatus,
  OrchestratorUsageView,
} from './orchestrator-contract';
import type { OrchestratorProjectContext } from './orchestrator-project-context';
import type { FeedbackSnapshotReply } from './work-feedback';

// ── Coordinator registry seam (Electron main) ──
//
// Coordinators register on `globalThis` because the plugin's runtime and
// extension bundles load through different loaders in the same main process
// (see the plugin's runtime/registry.ts). The shell's `sero:orchestrator:action`
// handler reaches a coordinator through this same global — typed here so the
// shell never imports plugin internals.

export const ORCHESTRATOR_REGISTRY_GLOBAL_KEY = '__seroOrchestratorCoordinators__';

/** The narrow coordinator surface the shell invokes. */
export interface OrchestratorCoordinatorHandle {
  requestAction(action: OrchestratorBoardAction): Promise<OrchestratorBoardActionResult>;
}

export interface OrchestratorRegistryEntryView {
  workspaceId: string;
  workspacePath: string;
  coordinator: OrchestratorCoordinatorHandle;
}

/** Reads the shared coordinator registry off `globalThis` (Electron main only). */
export function getOrchestratorRegistry(): ReadonlyMap<string, OrchestratorRegistryEntryView> | undefined {
  const globalScope = globalThis as Record<string, unknown>;
  return globalScope[ORCHESTRATOR_REGISTRY_GLOBAL_KEY] as
    | Map<string, OrchestratorRegistryEntryView>
    | undefined;
}

/**
 * Sends one board action to the coordinator registered for `workspaceId`.
 * A workspace without a coordinator answers with a result that names it, so a
 * runtime that dispatches into the wrong workspace learns which one.
 */
export async function requestOrchestratorAction(
  workspaceId: string,
  action: OrchestratorBoardAction,
): Promise<OrchestratorBoardActionResult> {
  const entry = getOrchestratorRegistry()?.get(workspaceId);
  if (!entry) {
    return { ok: false, error: `No Orchestrator coordinator is registered for workspace "${workspaceId}".` };
  }
  try {
    return await entry.coordinator.requestAction(action);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ── Room registry seam (Electron main) ──
//
// Rooms are registered by the same plugin on a sibling global key. Only
// creation is typed here: a plugin runtime that cannot use session tools needs
// to start a Room and get its id back, nothing more. The per-grant user approval
// still happens inside the plugin when the Room starts.

export const ORCHESTRATOR_ROOM_REGISTRY_GLOBAL_KEY = `${ORCHESTRATOR_REGISTRY_GLOBAL_KEY}:rooms`;

/** Limits a plugin runtime may set on a Room it creates. Mirrors the plugin's `RoomUserLimits`. */
export interface OrchestratorRoomCreateLimits {
  /** User-selected placement for this Room, independent of tool permissions. */
  executionMode?: 'workspace' | 'worktree';
  /** Caller-selected model pool; the Room planner cannot expand it. */
  models?: string[];
  thinkingLevels?: string[];
  maxCostUsd?: number;
  maxWallClockMs?: number;
  maxMembers?: number;
  /** The highest permission any member may hold. */
  access?: 'read-only' | 'edit-workspace' | 'edit-and-push';
  deliveryDestination?: OrchestratorDeliveryDestinationId;
}

export interface OrchestratorRoomCreateRequest {
  /** Stable identity for a caller recovering an interrupted creation. */
  requestId?: string;
  /** The Room's brief, kept verbatim. */
  mandate: string;
  limits?: OrchestratorRoomCreateLimits;
  /** Project/run attribution and the tier defaults resolved before planning. */
  project?: OrchestratorProjectContext;
  /**
   * A host-stored delegation policy the caller's user already approved. The
   * Room names it when it asks for its grant; the host decides whether the
   * grant fits. It is a reference, never authority: a Room created without it,
   * or with an id the host does not hold, is approved by the user as before.
   */
  delegationPolicyId?: string;
}

export type OrchestratorRoomCreateResult =
  | { ok: true; roomId: string; usage?: OrchestratorUsageView }
  /** `questions` is present when the planner needs an answer, so the caller can ask its user instead of failing. */
  | { ok: false; error: string; questions?: string[]; usage?: OrchestratorUsageView };

/** Why a Room is not taking turns, as its own runtime recorded it. */
export interface OrchestratorRoomHold {
  kind: string;
  detail: string;
}

export interface OrchestratorRoomInspection {
  status: OrchestratorRoomStatus;
  result: string | null;
  models: { name: string; model: string; thinking: string }[];
  /** Set while the Room is stopped for a recorded reason. */
  hold?: OrchestratorRoomHold;
  /** The Room's total working-time limit and what it has used, when it keeps them. */
  maxWallClockMs?: number;
  activeMs?: number;
}

/**
 * What a control call did. `status` is read back from the Room after the call,
 * so a caller reports the state the Room is in, not the command it sent.
 */
export type OrchestratorRoomControlResult =
  | { ok: true; status: OrchestratorRoomStatus }
  | { ok: false; error: string; status: OrchestratorRoomStatus | null };

/** The narrow Room surface a plugin runtime may call. */
export interface OrchestratorRoomHandle {
  /** Read durable findings and actual roster choices without opening member sessions. */
  inspect(roomId: string): Promise<OrchestratorRoomInspection | null>;
  /** Plans the team, then starts the Room, which raises the grant prompt. */
  create(request: OrchestratorRoomCreateRequest): Promise<OrchestratorRoomCreateResult>;
  /** Stops new turns. Turns in flight finish; nothing is lost. */
  pause(roomId: string): Promise<OrchestratorRoomControlResult>;
  /**
   * Continues the same Room. `maxWallClockMs` is a new TOTAL working-time
   * limit, not an increment, and may only be larger than the current one.
   * It changes no spending limit.
   */
  resume(roomId: string, options?: { maxWallClockMs?: number }): Promise<OrchestratorRoomControlResult>;
  cancel(roomId: string): Promise<OrchestratorRoomControlResult>;
  /**
   * What the work in this workspace is doing now, as bounded metadata. A caller
   * keeps the entries whose scope names its own project. Absent on a runtime
   * that keeps none.
   */
  feedback?(): Promise<FeedbackSnapshotReply>;
}

export interface OrchestratorRoomRegistryEntryView {
  handle: OrchestratorRoomHandle;
}

/** Reads the shared Room registry off `globalThis` (Electron main only). */
export function getOrchestratorRoomRegistry(): ReadonlyMap<string, OrchestratorRoomRegistryEntryView> | undefined {
  const globalScope = globalThis as Record<string, unknown>;
  return globalScope[ORCHESTRATOR_ROOM_REGISTRY_GLOBAL_KEY] as
    | Map<string, OrchestratorRoomRegistryEntryView>
    | undefined;
}

/** Creates a Room in `workspaceId`; a workspace without Room support answers with a result that names it. */
export async function createOrchestratorRoom(
  workspaceId: string,
  request: OrchestratorRoomCreateRequest,
): Promise<OrchestratorRoomCreateResult> {
  const entry = getOrchestratorRoomRegistry()?.get(workspaceId);
  if (!entry) {
    return { ok: false, error: `No Room coordinator is registered for workspace "${workspaceId}".` };
  }
  try {
    return await entry.handle.create(request);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

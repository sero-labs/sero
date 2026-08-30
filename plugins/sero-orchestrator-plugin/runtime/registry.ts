/**
 * Coordinator registry — shared between the app runtime (which populates it) and
 * the bridged extension tools/commands (which read it).
 *
 * IMPORTANT: the runtime entry and the extension entry are loaded by DIFFERENT
 * loaders (the runtime-loader bundles runtime/index.ts and inlines this module;
 * the Pi resource loader loads extension/index.ts separately). A plain
 * module-level Map would therefore exist as two distinct instances and the tool
 * would never see the coordinator the runtime registered. So the registry lives
 * on `globalThis`, which both module instances share in the Electron main
 * process (see 02-integration-seams.md, "CLI Bridge Boundary").
 */

import { ORCHESTRATOR_REGISTRY_GLOBAL_KEY } from '@sero-ai/common';
import type { Coordinator } from './coordinator';
import type { RoomAppActions } from './rooms/room-app-actions';
import type { RoomCallerSignals, RoomCommandRouter } from './rooms/room-command-router';
import type { RoomCoordinator } from './rooms/room-coordinator';
import type { GoalRuntime } from './goals/goal-runtime';

interface RegistryEntry {
  workspaceId: string;
  workspacePath: string;
  coordinator: Coordinator;
}

// Shared with the shell's `sero:orchestrator:action` IPC handler, which reads
// the same global through the contract types (@sero-ai/common).
const REGISTRY_KEY = ORCHESTRATOR_REGISTRY_GLOBAL_KEY;

function store(): Map<string, RegistryEntry> {
  const globalScope = globalThis as Record<string, unknown>;
  const existing = globalScope[REGISTRY_KEY] as Map<string, RegistryEntry> | undefined;
  if (existing) return existing;
  const created = new Map<string, RegistryEntry>();
  globalScope[REGISTRY_KEY] = created;
  return created;
}

export function registerCoordinator(
  workspaceId: string,
  workspacePath: string,
  coordinator: Coordinator,
): void {
  store().set(workspaceId, { workspaceId, workspacePath, coordinator });
}

export function unregisterCoordinator(workspaceId: string): void {
  store().delete(workspaceId);
}

export function getCoordinator(workspaceId: string): Coordinator | undefined {
  return store().get(workspaceId)?.coordinator;
}

/**
 * Resolve a coordinator from a working directory. App-agent tool sessions run
 * with `cwd` set to the workspace root, so bridged tools resolve the workspace
 * by matching the cwd against each registered workspace path.
 */
export function resolveCoordinatorByCwd(cwd: string): Coordinator | undefined {
  return entryByCwd(cwd)?.coordinator;
}

/** The registered workspace whose root contains `cwd` — the deepest one, when they nest. */
function entryByCwd(cwd: string): RegistryEntry | undefined {
  const normalized = normalize(cwd);
  let best: RegistryEntry | undefined;
  for (const entry of store().values()) {
    const root = normalize(entry.workspacePath);
    if (normalized === root || normalized.startsWith(`${root}/`)) {
      if (!best || root.length > normalize(best.workspacePath).length) best = entry;
    }
  }
  return best;
}

/**
 * Room runtimes, kept in their own map. A workspace can have a Workflow
 * coordinator and no Room coordinator — Room mode needs the AD-029 capability,
 * Workflow mode does not — so one map with an optional field would make every
 * caller handle a shape that cannot occur.
 *
 * On `globalThis` for the same reason the Workflow registry is: the runtime
 * entry and the extension entry are bundled by different loaders, and a plain
 * module-level Map would give the AD-020 command bridge a second, empty copy.
 */
const ROOM_REGISTRY_KEY = `${ORCHESTRATOR_REGISTRY_GLOBAL_KEY}:rooms`;

interface RoomRegistryEntry {
  coordinator: RoomCoordinator;
  /** The AD-020 command surface for this workspace's Rooms. */
  router: RoomCommandRouter;
  /** The user's control surface, which the Room panel drives. */
  app: RoomAppActions;
}

function roomStore(): Map<string, RoomRegistryEntry> {
  const globalScope = globalThis as Record<string, unknown>;
  const existing = globalScope[ROOM_REGISTRY_KEY] as Map<string, RoomRegistryEntry> | undefined;
  if (existing) return existing;
  const created = new Map<string, RoomRegistryEntry>();
  globalScope[ROOM_REGISTRY_KEY] = created;
  return created;
}

export function registerRoomCoordinator(
  workspaceId: string,
  coordinator: RoomCoordinator,
  router: RoomCommandRouter,
  app: RoomAppActions,
): void {
  roomStore().set(workspaceId, { coordinator, router, app });
}

export function unregisterRoomCoordinator(workspaceId: string): void {
  roomStore().delete(workspaceId);
}

export function getRoomCoordinator(workspaceId: string): RoomCoordinator | undefined {
  return roomStore().get(workspaceId)?.coordinator;
}

/**
 * The user's Room surface for the workspace that contains `cwd`.
 *
 * Rooms are registered by workspace id and the Workflow registry is the only
 * one that knows each workspace's path, so the lookup goes through it. A
 * workspace with Workflow mode but no Room runtime resolves to nothing, which
 * is the honest answer: Room mode is off or unsupported there.
 */
export function resolveRoomAppByCwd(cwd: string): RoomAppActions | undefined {
  const workspaceId = entryByCwd(cwd)?.workspaceId;
  return workspaceId ? roomStore().get(workspaceId)?.app : undefined;
}

/**
 * The command surface that owns the CALLER — not the one that owns its cwd.
 *
 * An editing member works in a managed worktree, which sits outside the
 * workspace root, so matching the directory against registered workspaces would
 * miss exactly the members that most need the bridge. Each router is asked
 * whether the caller is one of its members instead, and the roster answers.
 */
export async function resolveRoomRouterForCaller(
  signals: RoomCallerSignals,
): Promise<RoomCommandRouter | undefined> {
  for (const entry of roomStore().values()) {
    if (await entry.router.owns(signals)) return entry.router;
  }
  return undefined;
}

/**
 * Goal runtimes, in their own map for the same reason Rooms are: Goal mode is a
 * third Orchestrator mode with its own records, and one map with two optional
 * fields would give every caller a shape that cannot occur.
 *
 * On `globalThis` because the goal extension and the runtime entry are bundled
 * by different loaders — a module-level Map would give the in-session goal loop
 * a second, empty copy and it would never find the runtime.
 */
const GOAL_REGISTRY_KEY = `${ORCHESTRATOR_REGISTRY_GLOBAL_KEY}:goals`;

function goalStore(): Map<string, GoalRuntime> {
  const globalScope = globalThis as Record<string, unknown>;
  const existing = globalScope[GOAL_REGISTRY_KEY] as Map<string, GoalRuntime> | undefined;
  if (existing) return existing;
  const created = new Map<string, GoalRuntime>();
  globalScope[GOAL_REGISTRY_KEY] = created;
  return created;
}

export function registerGoalRuntime(workspaceId: string, runtime: GoalRuntime): void {
  goalStore().set(workspaceId, runtime);
}

export function unregisterGoalRuntime(workspaceId: string): void {
  goalStore().delete(workspaceId);
}

/**
 * The Goal runtime for the workspace that contains `cwd`. Goal runtimes are
 * registered by workspace id and the Workflow registry is the only one that
 * knows each workspace's path, so the lookup goes through it.
 */
export function resolveGoalRuntimeByCwd(cwd: string): GoalRuntime | undefined {
  const workspaceId = entryByCwd(cwd)?.workspaceId;
  return workspaceId ? goalStore().get(workspaceId) : undefined;
}

export function registeredWorkspaceIds(): string[] {
  return [...store().keys()];
}

function normalize(p: string): string {
  return p.replace(/\/+$/, '');
}

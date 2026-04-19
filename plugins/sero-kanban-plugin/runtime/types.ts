import type {
  AppRuntime,
  AppRuntimeContext,
  AppRuntimeHost,
  AppRuntimeModule,
  AppRuntimeStateApi,
  AppRuntimeDevServer,
  AppRuntimeStartManagedDevServerResult,
  AppRuntimeWorkspaceRuntimeResolution,
  KanbanState,
} from '@sero/common';

export type {
  AppRuntime,
  AppRuntimeContext,
  AppRuntimeHost,
  AppRuntimeModule,
  AppRuntimeStateApi,
  AppRuntimeDevServer,
  AppRuntimeStartManagedDevServerResult,
  AppRuntimeWorkspaceRuntimeResolution,
} from '@sero/common';

export type KanbanRuntimeState = KanbanState;

/**
 * Plugin-local alias for the generic host capability bag.
 *
 * Keep runtime code typed against this interface so later Kanban-specific
 * capability refinements stay local to `runtime/` without reaching for
 * desktop-internal imports.
 */
export interface KanbanRuntimeHost extends AppRuntimeHost {}

export interface KanbanRuntimeContext extends AppRuntimeContext {
  host: KanbanRuntimeHost;
}

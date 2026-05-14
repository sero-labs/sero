import type { WorkspaceRegistryEntry } from '@/types/ipc';
import type { DoctorResult } from '@electron/features/doctor/engine/types';
import type { WorkspaceRuntimeBackend } from '@/types/workspace-runtime';

export interface WorkspaceRegistry {
  workspaces: WorkspaceRegistryEntry[];
}

export type SetContainerEnabledResult = { ok: true; backend: WorkspaceRuntimeBackend }
  | { ok: false; error: { code: 'host-doctor-failed'; message: string; checks: DoctorResult[] } };

export interface WorkspaceManagerOptions {
  registryPath?: string;
  workspacesDir?: string;
  agentDir?: string;
  editorStateDir?: string;
}

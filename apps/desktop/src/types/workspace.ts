import type { OpenShellPolicyProfileHistoryEntry, OpenShellPolicyProfileId } from '@sero-ai/common';

/** Runtime provider persisted in .sero-workspace.json. */
export type WorkspaceRuntimeProviderId = 'host' | 'apple-container' | 'openshell-local';

export type WorkspaceRuntimePolicyHistoryEntry = OpenShellPolicyProfileHistoryEntry;

export interface WorkspaceRuntimeConfig {
  providerId: WorkspaceRuntimeProviderId;
  gatewayName?: string;
  sandboxName?: string;
  runtimeWorkspacePath?: string;
  experimental?: boolean;
  policyProfileId?: OpenShellPolicyProfileId;
  policyProfileUpdatedAt?: string;
  policyProfileHistory?: WorkspaceRuntimePolicyHistoryEntry[];
}

/** Entry in the workspace registry (~/.sero-ui/agent/workspaces.json). */
export interface WorkspaceRegistryEntry {
  id: string;
  path: string;
  open: boolean;
}

export interface WorkspaceRoot {
  id: string;
  name: string;
  path: string;
  kind?: 'folder' | 'linked-plugin';
}

export interface WorkspaceInfo {
  id: string;
  name: string;
  path: string;
  description?: string;
  contextHints?: string[];
  tags?: string[];
  open: boolean;
  container: boolean;
  runtime?: WorkspaceRuntimeConfig;
  references: string[];
  mounts: string[];
  roots: WorkspaceRoot[];
}

export interface EditorRoot {
  id: string;
  name: string;
  virtualPath: string;
  kind?: 'workspace' | 'folder' | 'linked-plugin';
}

export interface WorkspaceConfig {
  id: string;
  name: string;
  description?: string;
  container?: boolean;
  runtime?: WorkspaceRuntimeConfig;
  defaultCwd?: string;
  contextHints?: string[];
  skills?: string[];
  contextFiles?: string[];
  exclude?: string[];
  tags?: string[];
  references?: string[];
  mounts?: string[];
  roots?: WorkspaceRoot[];
}

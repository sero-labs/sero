import type {
  OpenShellPolicyProfileHistoryEntry,
  OpenShellPolicyProfileId,
  OpenShellCloudDiagnosticsIPC,
  OpenShellRemoteDiagnosticsIPC,
} from '@sero-ai/common';

/** Runtime provider persisted in .sero-workspace.json. */
export type WorkspaceRuntimeProviderId =
  | 'host'
  | 'apple-container'
  | 'openshell-local'
  | 'openshell-remote'
  | 'openshell-cloud';

export type WorkspaceRuntimePolicyHistoryEntry = OpenShellPolicyProfileHistoryEntry;

export interface WorkspaceRuntimeConfig {
  providerId: WorkspaceRuntimeProviderId;
  gatewayName?: string;
  sandboxName?: string;
  runtimeWorkspacePath?: string;
  experimental?: boolean;
  remoteGatewayId?: string;
  cloudGatewayId?: string;
  idleTimeoutMinutes?: number;
  lastActivityAt?: string;
  policyProfileId?: OpenShellPolicyProfileId;
  policyProfileUpdatedAt?: string;
  policyProfileHistory?: WorkspaceRuntimePolicyHistoryEntry[];
}

export interface OpenShellRemoteGatewayEntry {
  id: string;
  name: string;
  sshHost: string;
  sshKeyPath?: string;
  port: number;
  gatewayHost?: string;
  createdAt: string;
  updatedAt: string;
}

export type OpenShellRemoteGatewayInput = Omit<
  OpenShellRemoteGatewayEntry,
  'createdAt' | 'updatedAt'
>;

export type OpenShellRemoteGatewayTestResult = OpenShellRemoteDiagnosticsIPC;

export type OpenShellCloudAuthMode = 'none' | 'browser' | 'external';

export interface OpenShellCloudGatewayEntry {
  id: string;
  name: string;
  endpoint: string;
  authMode: OpenShellCloudAuthMode;
  resourceLabel?: string;
  cpuLabel?: string;
  memoryLabel?: string;
  gpuLabel?: string;
  costLabel?: string;
  idleTimeoutMinutes: number;
  createdAt: string;
  updatedAt: string;
  lastCheckedAt?: string;
}

export type OpenShellCloudGatewayInput = Omit<
  OpenShellCloudGatewayEntry,
  'createdAt' | 'updatedAt' | 'idleTimeoutMinutes'
> & {
  idleTimeoutMinutes?: number;
};

export type OpenShellCloudGatewayTestResult = OpenShellCloudDiagnosticsIPC;

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

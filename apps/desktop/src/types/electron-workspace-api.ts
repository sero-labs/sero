import type { WorkspaceRuntimeDiagnosticsIPC } from '@sero-ai/common';
import type {
  OpenShellRemoteGatewayEntry,
  OpenShellRemoteGatewayInput,
  OpenShellRemoteGatewayTestResult,
  OpenShellCloudGatewayEntry,
  OpenShellCloudGatewayInput,
  OpenShellCloudGatewayTestResult,
  WorkspaceConfig,
  WorkspaceInfo,
  WorkspaceRuntimeConfig,
  WorkspaceRoot,
} from './ipc';

export interface SeroWorkspaceAPI {
  /** List all registered workspaces (registry + config merged). */
  list(): Promise<WorkspaceInfo[]>;
  /** Create a new workspace. Optionally specify a parent directory for the workspace folder. */
  create(name: string, parentPath?: string, runtime?: WorkspaceRuntimeConfig): Promise<WorkspaceInfo>;
  /** Unregister a workspace (does not delete files). */
  remove(id: string): Promise<void>;
  /** Get full config for a workspace (.sero-workspace.json). */
  getConfig(id: string): Promise<WorkspaceConfig | null>;
  addFolder(folderPath: string, name?: string): Promise<WorkspaceInfo>;
  /** Expand workspace tree node (persisted). Also used by federated apps. */
  open(id: string): Promise<void>;
  /** Remove workspace from registry. Re-add via addFolder to restore. */
  close(id: string): Promise<void>;
  /** Open native folder picker. Returns selected path or null. */
  pickFolder(): Promise<string | null>;
  /** Infer best workspace for a message. Returns workspace ID. */
  infer(message: string): Promise<string>;
  /** Inspect desired vs actual runtime state for one workspace or all workspaces. */
  getRuntimeDiagnostics(workspaceId?: string): Promise<WorkspaceRuntimeDiagnosticsIPC[]>;
  setContainer(id: string, enabled: boolean): Promise<void>;
  setRuntime(id: string, runtime: WorkspaceRuntimeConfig | undefined): Promise<void>;
  listOpenShellRemoteGateways(): Promise<OpenShellRemoteGatewayEntry[]>;
  saveOpenShellRemoteGateway(entry: OpenShellRemoteGatewayInput): Promise<OpenShellRemoteGatewayEntry>;
  removeOpenShellRemoteGateway(id: string): Promise<void>;
  testOpenShellRemoteGateway(entry: OpenShellRemoteGatewayInput): Promise<OpenShellRemoteGatewayTestResult>;
  listOpenShellCloudGateways(): Promise<OpenShellCloudGatewayEntry[]>;
  saveOpenShellCloudGateway(entry: OpenShellCloudGatewayInput): Promise<OpenShellCloudGatewayEntry>;
  removeOpenShellCloudGateway(id: string): Promise<void>;
  testOpenShellCloudGateway(entry: OpenShellCloudGatewayInput): Promise<OpenShellCloudGatewayTestResult>;
  loginOpenShellCloudGateway(id: string): Promise<OpenShellCloudGatewayTestResult>;
  destroyOpenShellCloudSandbox(workspaceId: string): Promise<void>;
  /** Add a workspace reference (mount another workspace into this one's container). */
  addReference(id: string, refId: string): Promise<void>;
  /** Remove a workspace reference. */
  removeReference(id: string, refId: string): Promise<void>;
  /** Mount an arbitrary host folder into this workspace's container. */
  addMount(id: string, folderPath: string): Promise<void>;
  /** Remove an arbitrary folder mount. */
  removeMount(id: string, folderPath: string): Promise<void>;
  /** Set expanded/collapsed state for a workspace tree node. */
  setExpanded(id: string, expanded: boolean): Promise<void>;
  /** List all roots for a workspace (primary + linked). */
  listRoots(id: string): Promise<WorkspaceRoot[]>;
  /** Add an additional root (folder or linked plugin) to a workspace. */
  addRoot(
    id: string,
    input: { name: string; path: string; kind?: WorkspaceRoot['kind'] },
  ): Promise<WorkspaceRoot>;
  /** Remove an additional root (cannot remove the primary). */
  removeRoot(id: string, rootId: string): Promise<void>;
  /** Rename an additional root. */
  renameRoot(id: string, rootId: string, newName: string): Promise<void>;
}

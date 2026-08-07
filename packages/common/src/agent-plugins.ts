export type AgentPluginSourceKind = 'local' | 'git' | 'npm';
export type AgentPluginDiagnosticLevel = 'info' | 'warning' | 'error';
export type AgentPluginComponentKind = 'manifest' | 'skill' | 'mcp';

export interface AgentPluginDiagnostic {
  level: AgentPluginDiagnosticLevel;
  component: AgentPluginComponentKind;
  componentName?: string;
  message: string;
}

export interface AgentPluginManifest {
  $schema: string;
  name: string;
  version?: string;
  description?: string;
  author?: { name?: string; email?: string; url?: string };
  homepage?: string;
  repository?: string;
  license?: string;
  keywords?: string[];
  extensions?: Record<string, unknown>;
}

export interface AgentPluginSkill {
  name: string;
  description: string;
  directoryName: string;
  filePath: string;
  valid: boolean;
  exposedToCli: boolean;
}

export type AgentPluginMcpTransport = 'stdio' | 'streamable-http' | 'sse';

export interface AgentPluginMcpServer {
  name: string;
  runtimeName: string;
  transport: AgentPluginMcpTransport;
  valid: boolean;
  approved: boolean;
  exposedToCli: boolean;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  url?: string;
  headers?: Record<string, string>;
}

export interface AgentPluginCliState {
  enabled: boolean;
  namespace: string;
  skillCommands: string[];
  mcpCommands: string[];
}

export interface InstalledAgentPlugin {
  id: string;
  manifest: AgentPluginManifest;
  source: string;
  sourceKind: AgentPluginSourceKind;
  contentDigest: string;
  installedAt: string;
  updatedAt: string;
  packagePath: string;
  dataPath: string;
  enabled: boolean;
  mcpApprovalHash: string | null;
  skills: AgentPluginSkill[];
  mcpServers: AgentPluginMcpServer[];
  diagnostics: AgentPluginDiagnostic[];
  cli: AgentPluginCliState;
}

export interface AgentPluginInspection {
  manifest: AgentPluginManifest | null;
  source: string;
  sourceKind: AgentPluginSourceKind;
  contentDigest: string;
  valid: boolean;
  skills: AgentPluginSkill[];
  mcpServers: AgentPluginMcpServer[];
  diagnostics: AgentPluginDiagnostic[];
  requiresMcpApproval: boolean;
  suggestedNamespace: string | null;
}

export interface AgentPluginInstallRequest {
  source: string;
  contentDigest: string;
  approveMcpDefinitions: boolean;
  exposeToCli: boolean;
  namespaceAlias?: string;
}

export interface AgentPluginUpdateRequest {
  id: string;
  contentDigest: string;
  approveMcpChanges: boolean;
}

export interface AgentPluginUpdatePreview {
  pluginId: string;
  contentDigest: string;
  previousVersion?: string;
  nextVersion?: string;
  addedComponents: string[];
  removedComponents: string[];
  changedComponents: string[];
  addedCliCommands: string[];
  removedCliCommands: string[];
  mcpServers: AgentPluginMcpServer[];
  requiresMcpApproval: boolean;
}

export interface AgentPluginCliSettingsRequest {
  id: string;
  enabled: boolean;
  namespaceAlias?: string;
  skillNames?: string[];
  serverNames?: string[];
}

export interface AgentPluginRemoveRequest {
  id: string;
  retainData: boolean;
}

export interface AgentPluginChangeEvent {
  type: 'installed' | 'updated' | 'changed' | 'removed';
  pluginId: string;
}

export const AGENT_PLUGIN_MCP_SOURCES_EVENT = 'sero:agent-plugin-mcp-sources';
export const AGENT_PLUGIN_CLI_REFRESH_EVENT = 'sero:agent-plugin-cli-refresh';
export const MCP_METADATA_CACHE_RELATIVE_PATH = 'apps/mcp/metadata-cache.json';

export interface AgentPluginMcpSource {
  pluginId: string;
  pluginName: string;
  server: AgentPluginMcpServer;
}

export interface AgentPluginMcpSourcesRequest {
  accept(): void;
  resolve(sources: AgentPluginMcpSource[]): void;
}

export interface SeroAgentPluginsBridge {
  list(): Promise<InstalledAgentPlugin[]>;
  inspectSource(source: string): Promise<AgentPluginInspection>;
  install(request: AgentPluginInstallRequest): Promise<InstalledAgentPlugin>;
  previewUpdate(id: string): Promise<AgentPluginUpdatePreview>;
  update(request: AgentPluginUpdateRequest): Promise<InstalledAgentPlugin>;
  setEnabled(id: string, enabled: boolean): Promise<InstalledAgentPlugin>;
  setCliExposure(request: AgentPluginCliSettingsRequest): Promise<InstalledAgentPlugin>;
  approveComponents(id: string): Promise<InstalledAgentPlugin>;
  remove(request: AgentPluginRemoveRequest): Promise<void>;
  reveal(id: string, target: 'package' | 'data'): Promise<void>;
  onChanged(callback: (event: AgentPluginChangeEvent) => void): () => void;
}

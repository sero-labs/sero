export type ToolName =
  | 'node'
  | 'npm'
  | 'pnpm'
  | 'git'
  | 'ssh'
  | 'bash'
  | 'rg'
  | 'fd'
  | 'jq'
  | 'gh'
  | 'curl'
  | 'zip'
  | 'unzip';

export type ManagedToolPlatform = Extract<NodeJS.Platform, 'darwin' | 'linux' | 'win32'>;
export type ManagedToolArch = 'x64' | 'arm64';
export type ToolInstallPolicy = 'core' | 'on-demand' | 'large-explicit';
export type ToolSource = 'system' | 'managed';
export type ToolState = 'ready' | 'missing' | 'installing' | 'incompatible' | 'failed';

export interface ArtifactSpec {
  tool: ToolName;
  platform: ManagedToolPlatform;
  arch: ManagedToolArch;
  url: string;
  sha256: string;
  unpackTo: string;
  binPaths: Record<string, string>;
  minVersion?: string;
  installPolicy: ToolInstallPolicy;
}

export interface ToolchainManifest {
  version: string;
  artifacts: Record<string, ArtifactSpec>;
}

export interface ToolResolution {
  tool: ToolName;
  source: ToolSource;
  path: string;
  version?: string;
  binDir?: string;
}

export type ToolStatus =
  | (ToolResolution & { state: 'ready' })
  | {
      tool: ToolName;
      state: 'missing' | 'installing' | 'failed';
      source?: ToolSource;
      path?: string;
      version?: string;
      error?: ToolchainError;
    }
  | {
      tool: ToolName;
      state: 'incompatible';
      source: ToolSource;
      path: string;
      version?: string;
      requiredVersion?: string;
      error?: ToolchainError;
    };

export type ToolInstallReasonKind =
  | 'workspace-command'
  | 'workspace-shell'
  | 'workspace-terminal'
  | 'workspace-dev-server'
  | 'doctor'
  | 'settings'
  | 'agent-tool'
  | 'test';

export interface ToolInstallReason {
  kind: ToolInstallReasonKind;
  workspaceId?: string;
  workspacePath?: string;
  command?: string;
  detail?: string;
}

export type ToolchainProgressPhase =
  | 'queued'
  | 'resolving'
  | 'downloading'
  | 'verifying'
  | 'unpacking'
  | 'activating'
  | 'ready'
  | 'failed';

export interface ToolchainProgressEvent {
  tool: ToolName;
  artifactKey: string;
  manifestVersion: string;
  phase: ToolchainProgressPhase;
  reason?: ToolInstallReason;
  bytesReceived?: number;
  bytesTotal?: number;
  error?: ToolchainError;
}

export type ToolchainErrorCode =
  | 'TOOL_REQUIRED'
  | 'TOOL_INSTALL_FAILED'
  | 'TOOL_VERSION_INCOMPATIBLE'
  | 'TOOL_MANIFEST_INVALID'
  | 'TOOL_ARTIFACT_UNSUPPORTED';

export interface ToolchainError {
  code: ToolchainErrorCode;
  message: string;
  tool?: ToolName;
  artifactKey?: string;
  manifestVersion?: string;
  retryable: boolean;
  installable?: boolean;
  details?: Record<string, string | number | boolean | null>;
}

export type BrowserPackState = 'ready' | 'missing' | 'installable' | 'installing' | 'failed';
export type BrowserPackPlatform = Extract<NodeJS.Platform, 'darwin' | 'linux' | 'win32'>;
export type BrowserPackArch = 'x64' | 'arm64';

export interface BrowserPackArtifactSpec {
  platform: BrowserPackPlatform;
  arch: BrowserPackArch;
  url: string;
  sha256: string;
  unpackTo: 'browser';
  playwrightVersion: string;
  chromiumRevision: string;
  ffmpegRevision: string;
  chromiumExecutableCandidates: string[];
  ffmpegCandidates: string[];
  agentBrowserCandidates: string[];
}

export interface BrowserPackArtifactAvailabilitySpec {
  platform: BrowserPackPlatform;
  arch: BrowserPackArch;
  slug: string;
  available: boolean;
  status: string;
}

export type BrowserArtifactAvailability =
  | { state: 'built'; key: string; artifact: BrowserPackArtifactSpec }
  | { state: 'missing'; key: string; platform: BrowserPackPlatform; arch: BrowserPackArch; slug: string }
  | { state: 'unsupported'; platform: NodeJS.Platform; arch: string };

export interface BrowserPackManifest {
  version: string;
  artifacts: Record<string, BrowserPackArtifactSpec>;
  artifactAvailability?: Record<string, BrowserPackArtifactAvailabilitySpec>;
}

export type BrowserPackInstallReasonKind = 'settings' | 'onboarding' | 'agent-tool' | 'doctor' | 'test';

export interface BrowserPackInstallReason {
  kind: BrowserPackInstallReasonKind;
  workspaceId?: string;
  workspacePath?: string;
  detail?: string;
}

export type BrowserPackErrorCode =
  | 'BROWSER_PACK_REQUIRED'
  | 'BROWSER_PACK_INSTALL_FAILED'
  | 'BROWSER_PACK_UNAVAILABLE'
  | 'BROWSER_PACK_UNSUPPORTED'
  | 'BROWSER_PACK_LAUNCH_FAILED';

export interface BrowserPackError {
  code: BrowserPackErrorCode;
  message: string;
  retryable: boolean;
  installable: boolean;
  manifestVersion?: string;
  artifactKey?: string;
  details?: Record<string, string | number | boolean | null>;
}

export interface BrowserPackStatus {
  state: BrowserPackState;
  manifestVersion: string;
  previousManifestVersion?: string;
  artifactKey?: string;
  browsersPath?: string;
  error?: BrowserPackError;
}

export type BrowserPackProgressPhase =
  | 'queued'
  | 'downloading'
  | 'verifying'
  | 'unpacking'
  | 'activating'
  | 'ready'
  | 'failed'
  | 'uninstalling';

export interface BrowserPackProgressEvent {
  phase: BrowserPackProgressPhase;
  manifestVersion: string;
  artifactKey?: string;
  reason?: BrowserPackInstallReason;
  bytesReceived?: number;
  bytesTotal?: number;
  error?: BrowserPackError;
}

export type BrowserPackProgressListener = (event: BrowserPackProgressEvent) => void;

export interface BrowserRuntimeAdapter {
  browsersPath: string;
  chromiumExecutableCandidates: string[];
  ffmpegCandidates: string[];
  agentBrowserCandidates: string[];
  pathPrefixes: string[];
  tempDir: string;
  env: Record<string, string>;
}

export interface BrowserDoctorResult {
  state: 'ready' | 'installable' | 'missing' | 'installing' | 'failed';
  message?: string;
  details?: Record<string, string | number | boolean | null>;
}

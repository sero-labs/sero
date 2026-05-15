export type WorkspaceRuntimeBackend = 'apple-container' | 'docker' | 'host';
// Deprecated compatibility input; normalize to host on write.
export type DeprecatedWorkspaceRuntimeBackend = 'mac-host';
export type WorkspaceRuntimeBackendInput = WorkspaceRuntimeBackend | DeprecatedWorkspaceRuntimeBackend;

export interface WorkspaceRuntimeConfig {
  backend: WorkspaceRuntimeBackend;
  image?: string;
  previewPortPoolSize?: number;
}

export type WorkspaceRuntimeBackend = 'apple-container' | 'docker' | 'mac-host';

export interface WorkspaceRuntimeConfig {
  backend: WorkspaceRuntimeBackend;
  image?: string;
  previewPortPoolSize?: number;
}

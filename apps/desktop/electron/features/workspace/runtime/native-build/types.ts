import type { RuntimeBackendId } from '../types';

export type NativeBuildFailureKind =
  | 'node-gyp'
  | 'missing-make'
  | 'missing-gcc'
  | 'missing-gpp'
  | 'missing-clang'
  | 'missing-msvc'
  | 'missing-xcode-clt'
  | 'missing-python';

export interface NativeBuildFailure {
  kind: NativeBuildFailureKind;
  platform: NodeJS.Platform;
  command: string;
  executable?: string;
  evidence: string;
}

export type NativeBuildFallbackAction =
  | { type: 'show-install-instructions'; label: string }
  | { type: 'switch-workspace-runtime'; label: string; backend: Exclude<RuntimeBackendId, 'host'> }
  | { type: 'setup-container-runtime'; label: string }
  | { type: 'retry'; label: string };

export interface NativeBuildToolsRequiredMetadata {
  code: 'NATIVE_BUILD_TOOLS_REQUIRED';
  failure: NativeBuildFailure;
  title: string;
  message: string;
  installInstructions: string[];
  actions: NativeBuildFallbackAction[];
  seroInstallable: false;
}

export interface NativeBuildContainerFallbackOptions {
  backend?: Exclude<RuntimeBackendId, 'host'>;
}

export class NativeBuildToolsRequiredError extends Error {
  readonly code = 'NATIVE_BUILD_TOOLS_REQUIRED';
  readonly metadata: NativeBuildToolsRequiredMetadata;

  constructor(metadata: NativeBuildToolsRequiredMetadata) {
    super(metadata.message);
    this.name = 'NativeBuildToolsRequiredError';
    this.metadata = metadata;
  }
}

/**
 * What a runtime tells the user when a command needed native build tools.
 *
 * Reported instead of a bare failure so the view can name the missing tools and
 * offer the one action that fixes it, rather than leaving the user to infer it
 * from a compiler's output.
 *
 * Split out of app-runtime-background.ts (500-LOC limit); re-exported from there.
 */

export interface AppRuntimeNativeBuildFallbackAction {
  type: 'show-install-instructions' | 'switch-workspace-runtime' | 'setup-container-runtime' | 'retry';
  label: string;
  backend?: 'apple-container' | 'docker';
}

export interface AppRuntimeNativeBuildToolsRequiredMetadata {
  code: 'NATIVE_BUILD_TOOLS_REQUIRED';
  title: string;
  message: string;
  installInstructions: string[];
  actions: AppRuntimeNativeBuildFallbackAction[];
  seroInstallable: false;
  failure: {
    kind: string;
    platform: string;
    command: string;
    executable?: string;
    evidence: string;
  };
}

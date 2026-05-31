export interface VerifyHostModeReleaseResult {
  readonly requiredArtifactKeys: readonly string[];
  readonly requiredToolchainArtifactKeys: readonly string[];
  readonly warnings: readonly string[];
}

export function verifyHostModeRelease(options?: {
  readonly repoRoot?: string;
  readonly desktopRoot?: string;
  readonly verifyPublished?: boolean;
}): Promise<VerifyHostModeReleaseResult>;

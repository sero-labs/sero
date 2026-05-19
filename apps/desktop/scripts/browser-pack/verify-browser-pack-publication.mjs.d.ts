export interface VerifyBrowserPackTarget {
  readonly platform: string;
  readonly arch: string;
  readonly releaseSupported: boolean;
  readonly browserPackRequired: boolean;
}

export interface VerifyBrowserPackMetadata {
  readonly artifacts?: Record<string, unknown>;
}

export interface VerifyBrowserPackResult {
  readonly verifiedKeys: readonly string[];
  readonly warnings: readonly string[];
}

export function verifyBrowserPackPublication(options: {
  readonly targets: readonly VerifyBrowserPackTarget[];
  readonly metadata: VerifyBrowserPackMetadata;
  readonly downloadArtifact?: (url: string, key: string) => Promise<Uint8Array>;
}): Promise<VerifyBrowserPackResult>;

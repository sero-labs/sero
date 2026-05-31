export function verifyToolchainPublication(input: {
  targets: Array<{ platform: string; arch: string; releaseSupported: boolean }>;
  metadata: unknown;
  downloadArtifact?: (url: string, key: string) => Promise<Uint8Array | Buffer | string>;
}): Promise<{ verifiedKeys: string[]; warnings: string[] }>;

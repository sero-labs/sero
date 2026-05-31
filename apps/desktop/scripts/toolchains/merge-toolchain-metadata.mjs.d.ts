export function mergeToolchainMetadata(input: {
  sidecarDir: string;
  out?: string;
  metadataPath?: string;
  releaseTag: string;
  version: string;
}): Promise<void>;

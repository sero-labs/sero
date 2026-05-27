export function channelFromVersion(version: string): string;

export function updateInfoFileName(channel: string, arch: string): string;

export function buildFeedYaml(info: {
  readonly version: string;
  readonly artifactName: string;
  readonly sha512: string;
  readonly size: number;
  readonly releaseDate: string;
}): string;

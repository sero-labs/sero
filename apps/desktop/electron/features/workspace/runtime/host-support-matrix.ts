import hostReleaseTargets from './host-support-matrix.json';

export interface HostReleaseTarget {
  readonly platform: NodeJS.Platform;
  readonly arch: 'x64' | 'arm64';
  readonly releaseSupported: boolean;
  readonly hostDefault: boolean;
  readonly browserPackRequired: boolean;
  readonly packagedAppRequired: boolean;
  readonly notes?: string;
}

export const HOST_RELEASE_TARGETS = hostReleaseTargets as readonly HostReleaseTarget[];

export function getHostReleaseTarget(platform: NodeJS.Platform, arch: string): HostReleaseTarget | undefined {
  return HOST_RELEASE_TARGETS.find((target) => target.platform === platform && target.arch === arch);
}

export function isHostDefaultSupported(platform: NodeJS.Platform, arch: string): boolean {
  return getHostReleaseTarget(platform, arch)?.hostDefault === true;
}

export interface HostReleaseTarget {
  readonly platform: NodeJS.Platform;
  readonly arch: 'x64' | 'arm64';
  readonly releaseSupported: boolean;
  readonly hostDefault: boolean;
  readonly browserPackRequired: boolean;
  readonly packagedAppRequired: boolean;
  readonly notes?: string;
}

export const HOST_RELEASE_TARGETS = [
  {
    platform: 'darwin',
    arch: 'arm64',
    releaseSupported: true,
    hostDefault: true,
    browserPackRequired: true,
    packagedAppRequired: true,
  },
  {
    platform: 'darwin',
    arch: 'x64',
    releaseSupported: true,
    hostDefault: true,
    browserPackRequired: true,
    packagedAppRequired: true,
  },
  {
    platform: 'linux',
    arch: 'x64',
    releaseSupported: true,
    hostDefault: true,
    browserPackRequired: true,
    packagedAppRequired: true,
  },
  {
    platform: 'linux',
    arch: 'arm64',
    releaseSupported: true,
    hostDefault: true,
    browserPackRequired: true,
    packagedAppRequired: true,
  },
  {
    platform: 'win32',
    arch: 'x64',
    releaseSupported: true,
    hostDefault: true,
    browserPackRequired: true,
    packagedAppRequired: true,
  },
  {
    platform: 'win32',
    arch: 'arm64',
    releaseSupported: false,
    hostDefault: false,
    browserPackRequired: false,
    packagedAppRequired: false,
    notes: 'Future: needs Windows ARM runner/package/browser-pack smoke.',
  },
] as const satisfies readonly HostReleaseTarget[];

export function getHostReleaseTarget(platform: NodeJS.Platform, arch: string): HostReleaseTarget | undefined {
  return HOST_RELEASE_TARGETS.find((target) => target.platform === platform && target.arch === arch);
}

export function isHostDefaultSupported(platform: NodeJS.Platform, arch: string): boolean {
  return getHostReleaseTarget(platform, arch)?.hostDefault === true;
}

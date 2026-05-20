export type RuntimeBackend = 'host' | 'apple-container' | 'docker';

export const RUNTIME_BACKENDS: RuntimeBackend[] = ['host', 'apple-container', 'docker'];

export type SupportedPlatform = 'darwin' | 'linux' | 'win32';

// macOS Docker is redundant with apple-container; Windows Docker Desktop is
// manual-only in the test matrix. Both are intentionally excluded here.
const AVAILABILITY: Record<RuntimeBackend, ReadonlyArray<SupportedPlatform>> = {
  host: ['darwin', 'linux', 'win32'],
  'apple-container': ['darwin'],
  docker: ['linux'],
};

export function runtimeAvailableOn(
  backend: RuntimeBackend,
  platform: SupportedPlatform = process.platform as SupportedPlatform,
): boolean {
  return AVAILABILITY[backend].includes(platform);
}

export function runtimeSkipReason(
  backend: RuntimeBackend,
  platform: SupportedPlatform = process.platform as SupportedPlatform,
): string | null {
  if (runtimeAvailableOn(backend, platform)) return null;
  return `Runtime "${backend}" is not exercised on platform "${platform}" in the test matrix.`;
}

export function currentRuntimeFromEnv(): RuntimeBackend | undefined {
  const raw = process.env.SERO_E2E_RUNTIME;
  if (!raw) return undefined;
  if ((RUNTIME_BACKENDS as string[]).includes(raw)) return raw as RuntimeBackend;
  throw new Error(
    `Invalid SERO_E2E_RUNTIME="${raw}". Expected one of: ${RUNTIME_BACKENDS.join(', ')}.`,
  );
}

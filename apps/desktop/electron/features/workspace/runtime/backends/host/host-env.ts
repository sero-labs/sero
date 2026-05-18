import { addSeroCliEnv } from '@electron/cli/host-bridge/state';

const SAFE_INHERITED_ENV_KEYS = new Set([
  'PATH',
  'HOME',
  'USER',
  'LOGNAME',
  'LANG',
  'TERM',
  'SHELL',
  'TMPDIR',
  'TMP',
  'TEMP',
  'NVM_DIR',
  'FNM_DIR',
  'VOLTA_HOME',
  'PNPM_HOME',
  'NODE_OPTIONS',
  'NODE_EXTRA_CA_CERTS',
  'SSL_CERT_FILE',
  'SSL_CERT_DIR',
  'SSH_AUTH_SOCK',
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'NO_PROXY',
  'ALL_PROXY',
  'http_proxy',
  'https_proxy',
  'no_proxy',
  'all_proxy',
]);

const SAFE_INHERITED_ENV_PREFIXES = ['LC_', 'GIT_', 'npm_config_', 'NPM_CONFIG_'];

export async function createHostProcessEnv(
  workspaceId: string,
  overrides?: Record<string, string>,
  platform: NodeJS.Platform = process.platform,
): Promise<Record<string, string>> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined) continue;
    if (shouldInheritEnvKey(key, platform)) env[key] = value;
  }
  return addSeroCliEnv({ ...env, ...overrides }, {
    workspaceId,
    sessionId: overrides?.SERO_SESSION_ID,
  }, platform);
}

function shouldInheritEnvKey(key: string, platform: NodeJS.Platform): boolean {
  if (platform === 'win32' && key.toLowerCase() === 'path') return true;
  return SAFE_INHERITED_ENV_KEYS.has(key) || SAFE_INHERITED_ENV_PREFIXES.some((prefix) => key.startsWith(prefix));
}

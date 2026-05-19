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
  'GIT_TERMINAL_PROMPT',
  'npm_config_cache',
  'npm_config_prefix',
  'npm_config_user_agent',
  'NPM_CONFIG_CACHE',
  'NPM_CONFIG_PREFIX',
  'NPM_CONFIG_USER_AGENT',
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'NO_PROXY',
  'ALL_PROXY',
  'http_proxy',
  'https_proxy',
  'no_proxy',
  'all_proxy',
]);

const SAFE_INHERITED_ENV_PREFIXES = ['LC_'];
const SECRET_ENV_KEY_PATTERN = /(token|auth|password|passwd|credential|secret|askpass)/i;

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
  return addSeroCliEnv({ ...env, ...sanitizeEnvOverrides(overrides) }, {
    workspaceId,
    sessionId: overrides?.SERO_SESSION_ID,
  }, platform);
}

function shouldInheritEnvKey(key: string, platform: NodeJS.Platform): boolean {
  if (isSecretEnvKey(key)) return false;
  if (platform === 'win32' && key.toLowerCase() === 'path') return true;
  return SAFE_INHERITED_ENV_KEYS.has(key) || SAFE_INHERITED_ENV_PREFIXES.some((prefix) => key.startsWith(prefix));
}

function sanitizeEnvOverrides(overrides: Record<string, string> | undefined): Record<string, string> {
  if (!overrides) return {};
  return Object.fromEntries(Object.entries(overrides).filter(([key]) => !isSecretEnvKey(key)));
}

function isSecretEnvKey(key: string): boolean {
  return SECRET_ENV_KEY_PATTERN.test(key);
}

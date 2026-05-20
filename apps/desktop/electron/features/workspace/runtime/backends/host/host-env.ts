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
  'GIT_AUTHOR_NAME',
  'GIT_AUTHOR_EMAIL',
  'GIT_AUTHOR_DATE',
  'GIT_COMMITTER_NAME',
  'GIT_COMMITTER_EMAIL',
  'GIT_COMMITTER_DATE',
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
// Do not forward SSH_AUTH_SOCK to generic agent-run host commands. It is not a secret string,
// but it grants access to the user's SSH agent and should be opt-in for trusted flows.
const SECRET_ENV_KEY_PATTERN = /(token|password|passwd|credential|secret|askpass|authorization|(^|[_-])auth($|[_-]|token))/i;

export async function createHostProcessEnv(
  workspaceId: string,
  overrides?: Record<string, string>,
  platform: NodeJS.Platform = process.platform,
  options: { tokenMode?: 'single-use' | 'reusable' } = {},
): Promise<Record<string, string>> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined) continue;
    if (shouldInheritEnvKey(key, platform)) env[key] = value;
  }
  return addSeroCliEnv({ ...env, ...sanitizeEnvOverrides(overrides) }, {
    workspaceId,
    sessionId: overrides?.SERO_SESSION_ID,
    tokenMode: options.tokenMode,
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

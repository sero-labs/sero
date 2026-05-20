import { afterEach, describe, expect, it, vi } from 'vitest';

import { createHostProcessEnv } from '@electron/features/workspace/runtime/backends/host/host-env';
import { clearSeroCliBridgeStateForTests, setSeroCliBridgeConnection } from '@electron/cli/host-bridge/state';

describe('host runtime process environment', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    clearSeroCliBridgeStateForTests();
  });

  it('keeps common non-secret host environment needed for generic commands', async () => {
    vi.stubEnv('PATH', '/usr/bin');
    vi.stubEnv('HOME', '/home/tester');
    vi.stubEnv('TMPDIR', '/tmp');
    vi.stubEnv('LANG', 'en_US.UTF-8');
    vi.stubEnv('LC_ALL', 'en_US.UTF-8');
    vi.stubEnv('HTTPS_PROXY', 'http://proxy.example.test:8080');

    const env = await createHostProcessEnv('ws-1', undefined, 'linux');

    expect(env.PATH).toContain('/usr/bin');
    expect(env.HOME).toBe('/home/tester');
    expect(env.TMPDIR).toBe('/tmp');
    expect(env.LANG).toBe('en_US.UTF-8');
    expect(env.LC_ALL).toBe('en_US.UTF-8');
    expect(env.HTTPS_PROXY).toBe('http://proxy.example.test:8080');
    expect(env.SERO_WORKSPACE_ID).toBe('ws-1');
  });

  it('does not inherit credential-adjacent Git or package-manager variables', async () => {
    vi.stubEnv('GIT_ASKPASS', '/tmp/askpass');
    vi.stubEnv('GIT_TERMINAL_PROMPT', '0');
    vi.stubEnv('GIT_AUTHOR_NAME', 'Test Author');
    vi.stubEnv('GIT_AUTHOR_EMAIL', 'author@example.test');
    vi.stubEnv('GIT_COMMITTER_NAME', 'Test Committer');
    vi.stubEnv('GIT_COMMITTER_EMAIL', 'committer@example.test');
    vi.stubEnv('GIT_CREDENTIAL_HELPER', 'store');
    vi.stubEnv('SSH_AUTH_SOCK', '/tmp/agent.sock');
    vi.stubEnv('NPM_CONFIG__AUTH_TOKEN', 'npm-secret');
    vi.stubEnv('npm_config__authToken', 'npm-secret');
    vi.stubEnv('npm_config_cache', '/tmp/npm-cache');
    vi.stubEnv('MY_PASSWORD', 'pw');

    const env = await createHostProcessEnv('ws-1', {
      CUSTOM_TOKEN: 'override-secret',
      SAFE_VALUE: 'ok',
    }, 'linux');

    expect(env.GIT_ASKPASS).toBeUndefined();
    expect(env.GIT_CREDENTIAL_HELPER).toBeUndefined();
    expect(env.SSH_AUTH_SOCK).toBeUndefined();
    expect(env.NPM_CONFIG__AUTH_TOKEN).toBeUndefined();
    expect(env.npm_config__authToken).toBeUndefined();
    expect(env.MY_PASSWORD).toBeUndefined();
    expect(env.CUSTOM_TOKEN).toBeUndefined();
    expect(env.GIT_TERMINAL_PROMPT).toBe('0');
    expect(env.GIT_AUTHOR_NAME).toBe('Test Author');
    expect(env.GIT_AUTHOR_EMAIL).toBe('author@example.test');
    expect(env.GIT_COMMITTER_NAME).toBe('Test Committer');
    expect(env.GIT_COMMITTER_EMAIL).toBe('committer@example.test');
    expect(env.npm_config_cache).toBe('/tmp/npm-cache');
    expect(env.SAFE_VALUE).toBe('ok');
  });

  it('drops inherited Sero bridge tokens before minting a fresh scoped one', async () => {
    vi.stubEnv('SERO_CLI_TOKEN', 'stale-token');
    vi.stubEnv('SERO_CLI_ENDPOINT', 'http://127.0.0.1:1/old');
    setSeroCliBridgeConnection({ endpoint: 'http://127.0.0.1:1234/cli' });

    const env = await createHostProcessEnv('ws-1', { SERO_CLI_TOKEN: 'override-token' }, 'linux');

    expect(env.SERO_CLI_ENDPOINT).toBe('http://127.0.0.1:1234/cli');
    expect(env.SERO_CLI_TOKEN).toEqual(expect.any(String));
    expect(env.SERO_CLI_TOKEN).not.toBe('stale-token');
    expect(env.SERO_CLI_TOKEN).not.toBe('override-token');
  });
});

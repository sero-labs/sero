import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  migrateExistingInstall: vi.fn(),
  readRegistryLoadSync: vi.fn(),
  readRegistrySync: vi.fn(),
}));

vi.mock('fs', () => ({
  readFileSync: mocks.readFileSync,
  writeFileSync: mocks.writeFileSync,
  mkdirSync: mocks.mkdirSync,
}));

vi.mock('@electron/features/profile/migration', () => ({
  migrateExistingInstall: mocks.migrateExistingInstall,
}));

vi.mock('@electron/features/profile/manager', () => ({
  PROFILE_REGISTRY_PATH: '/tmp/profiles.json',
  readRegistryLoadSync: mocks.readRegistryLoadSync,
  readRegistrySync: mocks.readRegistrySync,
}));

describe('staged env bootstrap', () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.SERO_HOME;
    delete process.env.PI_CODING_AGENT_DIR;
    delete process.env.OPENAI_API_KEY;
    process.env.SERO_HOME_OVERRIDE = '/tmp/sero-profile';

    mocks.readFileSync.mockReset().mockImplementation((filePath: string) => {
      if (filePath === '/tmp/sero-profile/agent/.env') {
        return '# comment\nOPENAI_API_KEY=test-key\nPI_CODING_AGENT_DIR=should-not-win\n';
      }
      throw new Error(`Unexpected read: ${filePath}`);
    });
    mocks.writeFileSync.mockReset();
    mocks.mkdirSync.mockReset();
    mocks.migrateExistingInstall.mockReset();
    mocks.readRegistryLoadSync.mockReset();
    mocks.readRegistrySync.mockReset();
  });

  it('resolves profile-scoped paths first, then applies process env and .env values', async () => {
    const env = await import('@electron/platform/env');

    expect(env.SERO_HOME).toBe('/tmp/sero-profile');
    expect(env.SERO_AGENT_DIR).toBe('/tmp/sero-profile/agent');
    expect(env.AUTH_JSON_PATH).toBe('/tmp/sero-profile/agent/auth.json');
    expect(env.ACTIVE_PROFILE_ID).toBeNull();

    env.loadSeroEnv();

    expect(process.env.SERO_HOME).toBe('/tmp/sero-profile');
    expect(process.env.PI_CODING_AGENT_DIR).toBe('/tmp/sero-profile/agent');
    expect(process.env.OPENAI_API_KEY).toBe('test-key');
  });
});

import { afterEach, describe, expect, it } from 'vitest';

import { resolveAgentDir, resolveSessionStoreDir } from '../agent-dir';
import { resolveQmdDbPath } from '../qmd';
import { getSessionStoreDir } from '../session-transcripts';

const originalEnv = {
  SERO_HOME: process.env.SERO_HOME,
  PI_CODING_AGENT_DIR: process.env.PI_CODING_AGENT_DIR,
};

afterEach(() => {
  process.env.SERO_HOME = originalEnv.SERO_HOME;
  process.env.PI_CODING_AGENT_DIR = originalEnv.PI_CODING_AGENT_DIR;
});

describe('profile-scoped agent directory resolution', () => {
  it('uses the explicit PI_CODING_AGENT_DIR for QMD and transcript session storage', () => {
    process.env.PI_CODING_AGENT_DIR = '/tmp/sero-profile/agent';
    process.env.SERO_HOME = '/tmp/sero-profile';

    expect(resolveAgentDir()).toBe('/tmp/sero-profile/agent');
    expect(resolveQmdDbPath()).toBe('/tmp/sero-profile/agent/cache/qmd/index.sqlite');
    expect(resolveSessionStoreDir()).toBe('/tmp/sero-profile/agent/sessions');
    expect(getSessionStoreDir()).toBe('/tmp/sero-profile/agent/sessions');
  });

  it('falls back to SERO_HOME/agent when the Pi env bridge is absent', () => {
    delete process.env.PI_CODING_AGENT_DIR;
    process.env.SERO_HOME = '/tmp/sero-fallback-home';

    expect(resolveAgentDir()).toBe('/tmp/sero-fallback-home/agent');
    expect(resolveQmdDbPath()).toBe('/tmp/sero-fallback-home/agent/cache/qmd/index.sqlite');
    expect(resolveSessionStoreDir()).toBe('/tmp/sero-fallback-home/agent/sessions');
  });
});

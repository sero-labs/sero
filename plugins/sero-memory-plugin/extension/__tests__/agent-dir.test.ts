import path from 'node:path';
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

    const agentDir = '/tmp/sero-profile/agent';
    expect(resolveAgentDir()).toBe(agentDir);
    expect(resolveQmdDbPath()).toBe(path.join(agentDir, 'cache', 'qmd', 'index.sqlite'));
    expect(resolveSessionStoreDir()).toBe(path.join(agentDir, 'sessions'));
    expect(getSessionStoreDir()).toBe(path.join(agentDir, 'sessions'));
  });

  it('falls back to SERO_HOME/agent when the Pi env bridge is absent', () => {
    delete process.env.PI_CODING_AGENT_DIR;
    process.env.SERO_HOME = '/tmp/sero-fallback-home';

    const agentDir = path.join('/tmp/sero-fallback-home', 'agent');
    expect(resolveAgentDir()).toBe(agentDir);
    expect(resolveQmdDbPath()).toBe(path.join(agentDir, 'cache', 'qmd', 'index.sqlite'));
    expect(resolveSessionStoreDir()).toBe(path.join(agentDir, 'sessions'));
  });
});

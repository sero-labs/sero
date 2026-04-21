import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  getMcpAppDir,
  getMcpConfigPath,
  getMcpMetadataCachePath,
  getMcpOAuthDir,
  getMcpStatePath,
} from '../state/paths';

const ORIGINAL_ENV = {
  SERO_HOME: process.env.SERO_HOME,
  PI_CODING_AGENT_DIR: process.env.PI_CODING_AGENT_DIR,
};

afterEach(() => {
  restoreEnv('SERO_HOME', ORIGINAL_ENV.SERO_HOME);
  restoreEnv('PI_CODING_AGENT_DIR', ORIGINAL_ENV.PI_CODING_AGENT_DIR);
});

describe('MCP path helpers', () => {
  it('prefers SERO_HOME for app config, cache, and state while keeping OAuth under the Pi agent dir', () => {
    process.env.SERO_HOME = '/tmp/sero-home';
    process.env.PI_CODING_AGENT_DIR = '/tmp/sero-agent';

    expect(getMcpAppDir()).toBe(path.join('/tmp/sero-home', 'apps', 'mcp'));
    expect(getMcpStatePath('/workspace/project')).toBe(path.join('/tmp/sero-home', 'apps', 'mcp', 'state.json'));
    expect(getMcpConfigPath()).toBe(path.join('/tmp/sero-home', 'apps', 'mcp', 'config.json'));
    expect(getMcpMetadataCachePath()).toBe(path.join('/tmp/sero-home', 'apps', 'mcp', 'metadata-cache.json'));
    expect(getMcpOAuthDir()).toBe(path.join('/tmp/sero-agent', 'mcp-oauth'));
  });

  it('falls back to cwd-relative state and Pi agent files when SERO_HOME is absent', () => {
    delete process.env.SERO_HOME;
    process.env.PI_CODING_AGENT_DIR = '/tmp/pi-agent';

    expect(getMcpAppDir()).toBe(path.join('/tmp/pi-agent', 'mcp'));
    expect(getMcpStatePath('/workspace/project')).toBe(path.join('/workspace/project', '.sero', 'apps', 'mcp', 'state.json'));
    expect(getMcpConfigPath()).toBe(path.join('/tmp/pi-agent', 'mcp.json'));
    expect(getMcpMetadataCachePath()).toBe(path.join('/tmp/pi-agent', 'mcp-cache.json'));
    expect(getMcpOAuthDir()).toBe(path.join('/tmp/pi-agent', 'mcp-oauth'));
  });

  it('expands home-relative env vars before building paths', () => {
    process.env.SERO_HOME = '~/.sero-ui';
    process.env.PI_CODING_AGENT_DIR = '~/.sero-ui/agent';

    expect(getMcpAppDir()).toBe(path.join(os.homedir(), '.sero-ui', 'apps', 'mcp'));
    expect(getMcpOAuthDir()).toBe(path.join(os.homedir(), '.sero-ui', 'agent', 'mcp-oauth'));
  });
});

function restoreEnv(name: 'SERO_HOME' | 'PI_CODING_AGENT_DIR', value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}

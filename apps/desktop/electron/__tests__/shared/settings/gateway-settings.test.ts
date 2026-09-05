import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

vi.mock('@electron/platform/env', () => ({
  SERO_AGENT_DIR: '/tmp/sero-agent',
}));

vi.mock('fs', () => ({
  readFileSync: mocks.readFileSync,
  writeFileSync: mocks.writeFileSync,
}));

vi.mock('@electron/shared/providers/package-provider-manifests', () => ({
  invalidatePackageProviderManifestCache: vi.fn(),
}));

import {
  getGatewayEnabled,
  setGatewayEnabled,
  shouldAutoStartGateway,
} from '@electron/shared/settings/gateway-settings';

/** What was handed to writeFileSync, parsed back. */
function written(): Record<string, unknown> {
  const [, body] = mocks.writeFileSync.mock.calls[0] as [string, string];
  return JSON.parse(body) as Record<string, unknown>;
}

describe('the gateway enabled setting', () => {
  beforeEach(() => {
    mocks.readFileSync.mockReset();
    mocks.writeFileSync.mockReset();
  });

  it('is off when nothing has been saved', () => {
    mocks.readFileSync.mockImplementation(() => {
      throw Object.assign(new Error('missing'), { code: 'ENOENT' });
    });

    expect(getGatewayEnabled()).toBe(false);
  });

  it('is on when the profile saved it on', () => {
    mocks.readFileSync.mockReturnValue(
      JSON.stringify({ sero: { gateway: { enabled: true } } }),
    );

    expect(getGatewayEnabled()).toBe(true);
  });

  it('is off when a settings file cannot be read', () => {
    // Opening a port to the network is not the safe reading of a
    // broken file, so a parse failure must not turn the gateway on.
    mocks.readFileSync.mockReturnValue('{not-json');

    expect(getGatewayEnabled()).toBe(false);
  });

  it('is off for anything that is not exactly true', () => {
    mocks.readFileSync.mockReturnValue(
      JSON.stringify({ sero: { gateway: { enabled: 'yes' } } }),
    );

    expect(getGatewayEnabled()).toBe(false);
  });

  it('saves the choice under the sero namespace', () => {
    mocks.readFileSync.mockReturnValue(JSON.stringify({}));

    setGatewayEnabled(true);

    expect(written()).toEqual({ sero: { gateway: { enabled: true } } });
  });

  it('keeps every other setting when it saves', () => {
    mocks.readFileSync.mockReturnValue(
      JSON.stringify({
        model: 'anthropic/claude-opus-5',
        sero: { memory: { logging: { retentionDays: 14 } } },
      }),
    );

    setGatewayEnabled(true);

    expect(written()).toEqual({
      model: 'anthropic/claude-opus-5',
      sero: {
        memory: { logging: { retentionDays: 14 } },
        gateway: { enabled: true },
      },
    });
  });

  it('records being turned off, so the next launch stays quiet', () => {
    mocks.readFileSync.mockReturnValue(
      JSON.stringify({ sero: { gateway: { enabled: true } } }),
    );

    setGatewayEnabled(false);

    expect(written()).toEqual({ sero: { gateway: { enabled: false } } });
  });

  it('writes nothing over a settings file it could not read', () => {
    mocks.readFileSync.mockReturnValue('{not-json');

    setGatewayEnabled(true);

    // Rewriting it here would throw away everything else in the file.
    expect(mocks.writeFileSync).not.toHaveBeenCalled();
  });
});

describe('deciding whether to start at boot', () => {
  const saved = process.env.SERO_GATEWAY;

  beforeEach(() => {
    mocks.readFileSync.mockReset();
    delete process.env.SERO_GATEWAY;
  });

  afterEach(() => {
    if (saved === undefined) delete process.env.SERO_GATEWAY;
    else process.env.SERO_GATEWAY = saved;
  });

  it('stays off when neither the env nor the setting asks for it', () => {
    mocks.readFileSync.mockReturnValue(JSON.stringify({}));

    expect(shouldAutoStartGateway()).toBe(false);
  });

  it('starts when the profile left Remote Control on', () => {
    // This is the case that used to be forgotten on every restart.
    mocks.readFileSync.mockReturnValue(
      JSON.stringify({ sero: { gateway: { enabled: true } } }),
    );

    expect(shouldAutoStartGateway()).toBe(true);
  });

  it('starts when SERO_GATEWAY=1, whatever the setting says', () => {
    process.env.SERO_GATEWAY = '1';
    mocks.readFileSync.mockReturnValue(
      JSON.stringify({ sero: { gateway: { enabled: false } } }),
    );

    // The env var is an instruction for this launch, so it wins.
    expect(shouldAutoStartGateway()).toBe(true);
  });

  it('ignores any other value of SERO_GATEWAY', () => {
    process.env.SERO_GATEWAY = 'true';
    mocks.readFileSync.mockReturnValue(JSON.stringify({}));

    expect(shouldAutoStartGateway()).toBe(false);
  });
});

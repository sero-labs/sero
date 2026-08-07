import { describe, expect, it } from 'vitest';
import { nestedSeroLaunchReason, seroCdpEndpoint } from '../electron-app';

describe('nestedSeroLaunchReason', () => {
  it('allows a standalone Electron test launch', () => {
    expect(nestedSeroLaunchReason({})).toBeUndefined();
  });

  it('rejects a second Electron launch from a running Sero host', () => {
    expect(nestedSeroLaunchReason({ SERO_DESKTOP_HOST_PID: '1234' })).toContain('1234');
  });
});

describe('seroCdpEndpoint', () => {
  it('normalizes a CDP port', () => {
    expect(seroCdpEndpoint({ SERO_E2E_EXISTING_CDP: '9222' })).toBe('http://127.0.0.1:9222');
  });

  it('preserves an explicit CDP URL', () => {
    expect(seroCdpEndpoint({ SERO_E2E_EXISTING_CDP: 'http://localhost:9333' }))
      .toBe('http://localhost:9333');
  });

  it('requires an explicit existing host', () => {
    expect(() => seroCdpEndpoint({})).toThrow('SERO_E2E_EXISTING_CDP');
  });
});

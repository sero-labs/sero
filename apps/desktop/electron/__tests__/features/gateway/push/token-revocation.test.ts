import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { WebTokenManager, onWebTokensGone } from '@electron/features/gateway/bridge/web-tokens';

let configDir: string;
const stops: Array<() => void> = [];

/** Collect the token ids announced while this test runs. */
function watchGone(): string[] {
  const seen: string[] = [];
  stops.push(onWebTokensGone((ids) => seen.push(...ids)));
  return seen;
}

beforeEach(() => {
  configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sero-tokens-'));
});

afterEach(() => {
  for (const stop of stops.splice(0)) stop();
  fs.rmSync(configDir, { recursive: true, force: true });
});

describe('a token that stops being valid', () => {
  it('is announced when it is revoked', () => {
    const manager = new WebTokenManager(configDir);
    const created = manager.create(['ws-1'], 'phone');
    const gone = watchGone();

    expect(manager.revoke(created.token.slice(0, 8))).toBe(true);
    expect(gone).toEqual([created.token.slice(0, 8)]);
  });

  it('is announced when it expires', () => {
    const first = new WebTokenManager(configDir);
    const created = first.create(['ws-1'], 'phone', -1);
    const gone = watchGone();

    // A fresh manager prunes on load, which is where expiry is noticed.
    new WebTokenManager(configDir);

    expect(gone).toEqual([created.token.slice(0, 8)]);
  });

  it('announces nothing when the revoke matched no token', () => {
    const manager = new WebTokenManager(configDir);
    manager.create(['ws-1'], 'phone');
    const gone = watchGone();

    expect(manager.revoke('nosuchid')).toBe(false);
    expect(gone).toEqual([]);
  });
});

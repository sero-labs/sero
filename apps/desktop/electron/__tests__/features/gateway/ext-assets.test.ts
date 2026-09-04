import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { AssetTicketManager } from '@electron/features/gateway/security/asset-ticket';
import {
  parseAssetUrl,
  registerRemoteAssets,
  resetRemoteAssets,
  resolveAssetPath,
  rewriteFederationManifest,
} from '@electron/features/gateway/server/ext-assets';

/** A key of the length the manager insists on. */
function secretOf(fill: string): Buffer {
  return Buffer.alloc(32, fill);
}

describe('asset tickets', () => {
  it('accepts its own ticket and names the app', () => {
    const tickets = new AssetTicketManager(secretOf('a'));
    const ticket = tickets.issue('todo');

    expect(tickets.verify(ticket)?.appId).toBe('todo');
  });

  it('refuses a ticket signed with another secret', () => {
    const ticket = new AssetTicketManager(secretOf('a')).issue('todo');

    expect(new AssetTicketManager(secretOf('b')).verify(ticket)).toBeNull();
  });

  it('refuses an expired ticket', () => {
    const tickets = new AssetTicketManager(secretOf('a'));
    const ticket = tickets.issue('todo', -1);

    expect(tickets.verify(ticket)).toBeNull();
  });
});

describe('parseAssetUrl', () => {
  it('reads the file from the path', () => {
    expect(parseAssetUrl('/ext/todo/chunk.js?t=abc')).toEqual({
      appId: 'todo',
      filePath: 'chunk.js',
      ticket: 'abc',
    });
  });

  it('reads the file from the f parameter, which is how publicPath carries it', () => {
    expect(parseAssetUrl('/ext/todo/?t=abc&f=static/js/chunk.js')).toEqual({
      appId: 'todo',
      filePath: 'static/js/chunk.js',
      ticket: 'abc',
    });
  });

  it('defaults to the federation manifest', () => {
    expect(parseAssetUrl('/ext/todo/?t=abc')?.filePath).toBe('mf-manifest.json');
  });

  it('ignores a URL that is not an asset URL', () => {
    expect(parseAssetUrl('/api/sessions')).toBeNull();
  });
});

describe('rewriteFederationManifest', () => {
  it('points publicPath at the gateway and carries the ticket', () => {
    const raw = JSON.stringify({ metaData: { publicPath: 'auto' } });

    const rewritten = JSON.parse(rewriteFederationManifest(raw, 'todo', 'tick et'));

    expect(rewritten.metaData.publicPath).toBe('/ext/todo/?t=tick%20et&f=');
  });

  it('leaves an unparseable manifest alone', () => {
    expect(rewriteFederationManifest('not json', 'todo', 'abc')).toBe('not json');
  });
});

describe('resolveAssetPath', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ext-assets-'));
    fs.mkdirSync(path.join(root, 'dist', 'ui'), { recursive: true });
    fs.writeFileSync(path.join(root, 'dist', 'ui', 'chunk.js'), 'x');
    fs.writeFileSync(path.join(root, 'secret.txt'), 'x');
    registerRemoteAssets('todo', root);
  });

  afterEach(() => {
    resetRemoteAssets();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('resolves a file inside dist/ui', () => {
    expect(resolveAssetPath(root, 'chunk.js')).toBe(path.join(root, 'dist', 'ui', 'chunk.js'));
  });

  it('refuses a path that climbs out of dist/ui', () => {
    expect(resolveAssetPath(root, '../../secret.txt')).toBeNull();
  });

  it('refuses a symlink that points out of dist/ui', () => {
    fs.symlinkSync(path.join(root, 'secret.txt'), path.join(root, 'dist', 'ui', 'link.txt'));

    expect(resolveAssetPath(root, 'link.txt')).toBeNull();
  });
});

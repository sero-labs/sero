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
  it('reads the ticket, the app and the file from the path', () => {
    expect(parseAssetUrl('/ext/abc/todo/chunk.js')).toEqual({
      appId: 'todo',
      filePath: 'chunk.js',
      ticket: 'abc',
    });
  });

  it('reads a nested chunk, which is how a plugin bundle asks for its own files', () => {
    expect(parseAssetUrl('/ext/abc/todo/assets/NotesWidget-x1.js')).toEqual({
      appId: 'todo',
      filePath: 'assets/NotesWidget-x1.js',
      ticket: 'abc',
    });
  });

  it('defaults to the federation manifest', () => {
    expect(parseAssetUrl('/ext/abc/todo/')?.filePath).toBe('mf-manifest.json');
    expect(parseAssetUrl('/ext/abc/todo')?.filePath).toBe('mf-manifest.json');
  });

  it('ignores a URL with no app in it', () => {
    expect(parseAssetUrl('/ext/abc')).toBeNull();
  });

  it('ignores a URL that is not an asset URL', () => {
    expect(parseAssetUrl('/api/sessions')).toBeNull();
  });
});

describe('rewriteFederationManifest', () => {
  it('points publicPath at a ticketed directory, so inferred chunk URLs stay ticketed', () => {
    const raw = JSON.stringify({ metaData: { publicPath: 'auto' } });

    const rewritten = JSON.parse(rewriteFederationManifest(raw, 'todo', 'tick et'));

    expect(rewritten.metaData.publicPath).toBe('/ext/tick%20et/todo/');
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

import fs from 'fs';
import os from 'os';
import path from 'path';
import { gzip } from 'zlib';
import { promisify } from 'util';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { unpackArchive } from '@electron/features/workspace/runtime/toolchains/archives';

const gzipAsync = promisify(gzip);
const tempRoots: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(tempRoots.splice(0).map((root) => fs.promises.rm(root, { recursive: true, force: true })));
});

describe('toolchain archive unpacking', () => {
  it('extracts tar.gz archives with the default unpacker', async () => {
    const root = await tempRoot();
    const archivePath = path.join(root, 'fixture.tar.gz');
    const destination = path.join(root, 'out');
    await fs.promises.writeFile(archivePath, await makeTarGz([
      { name: 'bin/tool', type: 'file', content: 'tool-ok', mode: 0o755 },
      { name: 'lib/', type: 'dir' },
      { name: 'lib/readme.txt', type: 'file', content: 'hello', mode: 0o644 },
      { name: 'lib/readme-link.txt', type: 'symlink', linkName: 'readme.txt' },
      { name: 'agent-browser/node_modules/.bin/agent-browser', type: 'symlink', linkName: '../agent-browser/bin/agent-browser.js' },
      { name: 'agent-browser/node_modules/agent-browser/bin/agent-browser.js', type: 'file', content: 'agent' },
      { name: './PaxHeader/long-file', type: 'pax', paxRecords: { path: 'lib/from-pax.txt' } },
      { name: 'lib/truncated-pax-name', type: 'file', content: 'pax-ok' },
    ]));

    await unpackArchive({ archivePath, destination });

    await expect(fs.promises.readFile(path.join(destination, 'bin/tool'), 'utf8')).resolves.toBe('tool-ok');
    await expect(fs.promises.readFile(path.join(destination, 'lib/readme.txt'), 'utf8')).resolves.toBe('hello');
    await expect(fs.promises.readFile(path.join(destination, 'lib/from-pax.txt'), 'utf8')).resolves.toBe('pax-ok');
    await expect(fs.promises.readlink(path.join(destination, 'lib/readme-link.txt'))).resolves.toBe('readme.txt');
    await expect(fs.promises.readlink(path.join(destination, 'agent-browser/node_modules/.bin/agent-browser'))).resolves.toBe('../agent-browser/bin/agent-browser.js');
    expect((await fs.promises.stat(path.join(destination, 'bin/tool'))).mode & 0o777).toBe(0o755);
    expect((await fs.promises.stat(path.join(destination, 'lib/readme.txt'))).mode & 0o777).toBe(0o644);
  });

  it('extracts gzip tar archives even when the download path has no extension', async () => {
    const root = await tempRoot();
    const archivePath = path.join(root, 'browser-browser-darwin-arm64');
    const destination = path.join(root, 'out');
    await fs.promises.writeFile(archivePath, await makeTarGz([
      { name: 'agent-browser/bin/agent-browser', type: 'file', content: 'agent-ok' },
    ]));

    await unpackArchive({ archivePath, destination });

    await expect(fs.promises.readFile(path.join(destination, 'agent-browser/bin/agent-browser'), 'utf8')).resolves.toBe('agent-ok');
  });

  it('copies safe symlink targets when the platform refuses symlink creation', async () => {
    const root = await tempRoot();
    const archivePath = path.join(root, 'fixture.tar.gz');
    const destination = path.join(root, 'out');
    await fs.promises.writeFile(archivePath, await makeTarGz([
      { name: 'agent-browser/node_modules/.bin/agent-browser', type: 'symlink', linkName: '../agent-browser/bin/agent-browser.js' },
      { name: 'agent-browser/node_modules/agent-browser/bin/agent-browser.js', type: 'file', content: 'agent-ok' },
    ]));
    vi.spyOn(fs.promises, 'symlink').mockRejectedValue(Object.assign(new Error('symlink refused'), { code: 'ENOTSUP' }));

    await unpackArchive({ archivePath, destination });

    await expect(fs.promises.readFile(path.join(destination, 'agent-browser/node_modules/.bin/agent-browser'), 'utf8'))
      .resolves.toBe('agent-ok');
  });

  it('rejects tar.gz symlinks that escape the destination', async () => {
    const root = await tempRoot();
    const archivePath = path.join(root, 'evil-link.tar.gz');
    const destination = path.join(root, 'out');
    await fs.promises.writeFile(archivePath, await makeTarGz([
      { name: 'lib/escape-link', type: 'symlink', linkName: '../../escape.txt' },
    ]));

    await expect(unpackArchive({ archivePath, destination })).rejects.toThrow(/Unsafe tar symlink target/);
  });

  it('rejects tar.gz entries that escape the destination', async () => {
    const root = await tempRoot();
    const archivePath = path.join(root, 'evil.tar.gz');
    const destination = path.join(root, 'out');
    await fs.promises.writeFile(archivePath, await makeTarGz([
      { name: '../escape.txt', type: 'file', content: 'nope' },
    ]));

    await expect(unpackArchive({ archivePath, destination })).rejects.toThrow(/Unsafe tar entry path/);
    await expect(fs.promises.access(path.join(root, 'escape.txt'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects hardlinks and removes partially extracted output', async () => {
    const root = await tempRoot();
    const archivePath = path.join(root, 'hardlink.tar.gz');
    const destination = path.join(root, 'out');
    await fs.promises.writeFile(archivePath, await makeTarGz([
      { name: 'partial.txt', type: 'file', content: 'partial' },
      { name: 'copy.txt', type: 'hardlink', linkName: 'partial.txt' },
    ]));

    await expect(unpackArchive({ archivePath, destination })).rejects.toThrow(/Unsupported tar hardlink/);
    await expect(fs.promises.access(destination)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects special entries and removes partially extracted output', async () => {
    const root = await tempRoot();
    const archivePath = path.join(root, 'special.tar.gz');
    const destination = path.join(root, 'out');
    await fs.promises.writeFile(archivePath, await makeTarGz([
      { name: 'partial.txt', type: 'file', content: 'partial' },
      { name: 'device', type: 'special', typeFlag: '3' },
    ]));

    await expect(unpackArchive({ archivePath, destination })).rejects.toThrow(/Unsupported tar entry type 3/);
    await expect(fs.promises.access(destination)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects malformed tar.gz data and removes the destination', async () => {
    const root = await tempRoot();
    const archivePath = path.join(root, 'malformed.tar.gz');
    const destination = path.join(root, 'out');
    await fs.promises.mkdir(destination, { recursive: true });
    await fs.promises.writeFile(path.join(destination, 'stale.txt'), 'stale');
    await fs.promises.writeFile(archivePath, await gzipAsync(Buffer.alloc(512, 1)));

    await expect(unpackArchive({ archivePath, destination })).rejects.toThrow();
    await expect(fs.promises.access(destination)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});

interface TarEntry {
  name: string;
  type: 'file' | 'dir' | 'symlink' | 'pax' | 'hardlink' | 'special';
  content?: string;
  linkName?: string;
  mode?: number;
  paxRecords?: Record<string, string>;
  typeFlag?: string;
}

async function tempRoot(): Promise<string> {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'sero-archive-test-'));
  tempRoots.push(root);
  return root;
}

async function makeTarGz(entries: TarEntry[]): Promise<Buffer> {
  return gzipAsync(Buffer.concat([...entries.map(tarEntry), Buffer.alloc(1024)]));
}

function tarEntry(entry: TarEntry): Buffer {
  const content = Buffer.from(entry.type === 'pax' ? paxContent(entry.paxRecords ?? {}) : entry.content ?? '');
  const header = Buffer.alloc(512);
  writeString(header, 0, 100, entry.name);
  writeString(header, 100, 8, (entry.mode ?? 0o755).toString(8).padStart(7, '0'));
  writeString(header, 108, 8, '0000000');
  writeString(header, 116, 8, '0000000');
  writeString(header, 124, 12, (entry.type === 'file' || entry.type === 'pax') ? content.length.toString(8).padStart(11, '0') : '00000000000');
  writeString(header, 136, 12, '00000000000');
  header.fill(32, 148, 156);
  writeString(header, 156, 1, entry.typeFlag ?? tarType(entry.type));
  if (entry.type === 'symlink' || entry.type === 'hardlink') writeString(header, 157, 100, entry.linkName ?? '');
  writeString(header, 257, 6, 'ustar');
  writeString(header, 263, 2, '00');
  const checksum = [...header].reduce((sum, byte) => sum + byte, 0);
  writeString(header, 148, 8, checksum.toString(8).padStart(6, '0') + '\0 ');
  return Buffer.concat([header, content, Buffer.alloc(Math.ceil(content.length / 512) * 512 - content.length)]);
}

function tarType(type: TarEntry['type']): string {
  if (type === 'dir') return '5';
  if (type === 'symlink') return '2';
  if (type === 'pax') return 'x';
  if (type === 'hardlink') return '1';
  return '0';
}

function paxContent(records: Record<string, string>): string {
  return Object.entries(records).map(([key, value]) => paxRecord(key, value)).join('');
}

function paxRecord(key: string, value: string): string {
  const body = `${key}=${value}\n`;
  let length = Buffer.byteLength(body) + 3;
  while (String(length).length + 1 + Buffer.byteLength(body) !== length) {
    length = String(length).length + 1 + Buffer.byteLength(body);
  }
  return `${length} ${body}`;
}

function writeString(buffer: Buffer, offset: number, length: number, value: string): void {
  buffer.write(value, offset, Math.min(length, Buffer.byteLength(value)), 'utf8');
}

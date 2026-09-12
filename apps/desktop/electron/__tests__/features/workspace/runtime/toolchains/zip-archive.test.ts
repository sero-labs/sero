import fs from 'fs';
import os from 'os';
import path from 'path';
import { deflateRawSync } from 'zlib';

import { afterEach, describe, expect, it } from 'vitest';

import { unpackArchive } from '@electron/features/workspace/runtime/toolchains/archives';
import { unpackZipArchive } from '@electron/features/workspace/runtime/toolchains/zip-archive';

interface ZipEntryInput {
  name: string;
  data: Buffer | string;
  method?: 0 | 8;
}

const roots: string[] = [];

function tempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sero-zip-test-'));
  roots.push(root);
  return root;
}

function createZip(entries: ZipEntryInput[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const raw = typeof entry.data === 'string' ? Buffer.from(entry.data, 'utf8') : entry.data;
    const method = entry.method ?? 0;
    const data = method === 8 ? deflateRawSync(raw) : raw;
    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    name.copy(local, 30);
    locals.push(local, data);

    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    name.copy(central, 46);
    centrals.push(central);
    offset += local.length + data.length;
  }

  const directory = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(directory.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, eocd]);
}

describe('zip archive unpacking', () => {
  afterEach(() => {
    for (const root of roots) fs.rmSync(root, { recursive: true, force: true });
    roots.length = 0;
  });

  it('extracts stored and deflated entries and marks them executable', async () => {
    const root = tempRoot();
    const archivePath = path.join(root, 'rtk.zip');
    fs.writeFileSync(archivePath, createZip([
      { name: 'rtk.exe', data: 'binary payload' },
      { name: 'LICENSE.txt', data: 'license text', method: 8 },
    ]));

    const destination = path.join(root, 'out');
    await unpackZipArchive(archivePath, destination);

    expect(fs.readFileSync(path.join(destination, 'rtk.exe'), 'utf8')).toBe('binary payload');
    expect(fs.readFileSync(path.join(destination, 'LICENSE.txt'), 'utf8')).toBe('license text');
    expect(fs.statSync(path.join(destination, 'rtk.exe')).mode & 0o111).not.toBe(0);
  });

  it('rejects entries that escape the destination', async () => {
    const root = tempRoot();
    const archivePath = path.join(root, 'evil.zip');
    fs.writeFileSync(archivePath, createZip([{ name: '../escape.exe', data: 'nope' }]));

    await expect(unpackZipArchive(archivePath, path.join(root, 'out'))).rejects.toThrow(/Unsafe ZIP entry path/);
  });

  it('rejects unsupported compression methods', async () => {
    const root = tempRoot();
    const archivePath = path.join(root, 'bzip2.zip');
    const zip = createZip([{ name: 'rtk.exe', data: 'nope' }]);
    const centralOffset = zip.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    // Rewrite the central directory compression method to an unsupported value (bzip2 = 12).
    zip.writeUInt16LE(12, centralOffset + 10);
    fs.writeFileSync(archivePath, zip);

    await expect(unpackZipArchive(archivePath, path.join(root, 'out'))).rejects.toThrow(/Unsupported ZIP compression method/);
  });

  it('routes .zip archives through unpackArchive by content and extension', async () => {
    const root = tempRoot();
    const archivePath = path.join(root, 'bundle.bin');
    fs.writeFileSync(archivePath, createZip([{ name: 'rtk.exe', data: 'payload' }]));
    const destination = path.join(root, 'out');

    await unpackArchive({ archivePath, destination });

    expect(fs.readFileSync(path.join(destination, 'rtk.exe'), 'utf8')).toBe('payload');
  });
});

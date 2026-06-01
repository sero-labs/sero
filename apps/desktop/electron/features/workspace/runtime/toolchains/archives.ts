import fs from 'fs';
import os from 'os';
import path from 'path';
import { createGunzip } from 'zlib';

const TAR_BLOCK_SIZE = 512;
const MAX_COMPRESSED_ARCHIVE_BYTES = 2 * 1024 * 1024 * 1024;
const MAX_DECOMPRESSED_ARCHIVE_BYTES = 8 * 1024 * 1024 * 1024;

export interface UnpackArchiveOptions {
  archivePath: string;
  destination: string;
}

export type ArchiveUnpacker = (options: UnpackArchiveOptions) => Promise<void>;

export async function unpackArchive(options: UnpackArchiveOptions): Promise<void> {
  await fs.promises.rm(options.destination, { recursive: true, force: true });
  await fs.promises.mkdir(path.dirname(options.destination), { recursive: true });

  const stats = await fs.promises.stat(options.archivePath);
  if (stats.isDirectory()) {
    await fs.promises.cp(options.archivePath, options.destination, { recursive: true, force: true });
    return;
  }

  if (options.archivePath.endsWith('.raw')) {
    await fs.promises.mkdir(options.destination, { recursive: true });
    await fs.promises.copyFile(options.archivePath, path.join(options.destination, path.basename(options.archivePath, '.raw')));
    return;
  }

  if (options.archivePath.endsWith('.tar.gz') || options.archivePath.endsWith('.tgz') || await isGzipFile(options.archivePath)) {
    await unpackTarGz(options.archivePath, options.destination);
    return;
  }

  throw new Error(`Unsupported archive format for ${options.archivePath}`);
}

async function isGzipFile(filePath: string): Promise<boolean> {
  const handle = await fs.promises.open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(2);
    const result = await handle.read(buffer, 0, 2, 0);
    return result.bytesRead === 2 && buffer[0] === 0x1f && buffer[1] === 0x8b;
  } finally {
    await handle.close();
  }
}

async function unpackTarGz(archivePath: string, destination: string): Promise<void> {
  const archiveStats = await fs.promises.stat(archivePath);
  if (archiveStats.size > MAX_COMPRESSED_ARCHIVE_BYTES) {
    throw new Error(`Archive ${archivePath} exceeds maximum compressed size`);
  }

  const tempTarPath = await gunzipToTempTar(archivePath);
  await fs.promises.mkdir(destination, { recursive: true });
  try {
    await extractTarFile(tempTarPath, destination);
  } catch (error) {
    await fs.promises.rm(destination, { recursive: true, force: true });
    throw error;
  } finally {
    await fs.promises.rm(tempTarPath, { force: true });
  }
}

function gunzipToTempTar(archivePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const tempTarPath = path.join(os.tmpdir(), `sero-archive-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.tar`);
    const input = fs.createReadStream(archivePath);
    const gunzip = createGunzip();
    const output = fs.createWriteStream(tempTarPath);
    let decompressedBytes = 0;
    let settled = false;

    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      input.destroy();
      gunzip.destroy();
      output.destroy();
      fs.promises.rm(tempTarPath, { force: true }).finally(() => reject(error));
    };

    gunzip.on('data', (chunk: Buffer) => {
      decompressedBytes += chunk.length;
      if (decompressedBytes > MAX_DECOMPRESSED_ARCHIVE_BYTES) {
        fail(new Error(`Archive ${archivePath} exceeds maximum decompressed size`));
      }
    });
    input.on('error', fail);
    gunzip.on('error', fail);
    output.on('error', fail);
    output.on('finish', () => {
      if (settled) return;
      settled = true;
      resolve(tempTarPath);
    });
    input.pipe(gunzip).pipe(output);
  });
}

async function extractTarFile(tarPath: string, destination: string): Promise<void> {
  const tarStats = await fs.promises.stat(tarPath);
  const handle = await fs.promises.open(tarPath, 'r');
  try {
    let offset = 0;
    let sawEndOfArchive = false;
    let nextPaxHeader: PaxHeader | null = null;
    let nextGnuLongName: string | null = null;
    let nextGnuLongLinkName: string | null = null;
    const pendingSymlinks: PendingSymlink[] = [];

    while (offset + TAR_BLOCK_SIZE <= tarStats.size) {
      const header = await readExactly(handle, offset, TAR_BLOCK_SIZE);
      if (isZeroBlock(header)) {
        sawEndOfArchive = true;
        break;
      }

      const name = readTarString(header, 0, 100);
      const prefix = readTarString(header, 345, 155);
      const headerEntryName = prefix ? `${prefix}/${name}` : name;
      const mode = readTarOctal(header, 100, 8);
      const size = readTarOctal(header, 124, 12);
      const typeFlag = readTarString(header, 156, 1) || '0';
      const headerLinkName = readTarString(header, 157, 100);
      const dataStart = offset + TAR_BLOCK_SIZE;
      const dataEnd = dataStart + size;
      if (dataEnd > tarStats.size) throw new Error(`Invalid tar entry ${headerEntryName}: size exceeds archive length`);

      if (typeFlag === 'x') {
        if (size > 1024 * 1024) throw new Error(`Invalid pax header ${headerEntryName}: too large`);
        nextPaxHeader = parsePaxHeader(await readExactly(handle, dataStart, size));
        offset = dataStart + roundUpToBlock(size);
        continue;
      }
      if (typeFlag === 'g') {
        offset = dataStart + roundUpToBlock(size);
        continue;
      }
      if (typeFlag === 'L' || typeFlag === 'K') {
        if (size > 1024 * 1024) throw new Error(`Invalid GNU long tar entry ${headerEntryName}: too large`);
        const value = parseGnuLongValue(await readExactly(handle, dataStart, size));
        if (typeFlag === 'L') nextGnuLongName = value;
        if (typeFlag === 'K') nextGnuLongLinkName = value;
        offset = dataStart + roundUpToBlock(size);
        continue;
      }

      const paxHeader = nextPaxHeader;
      const entryName = paxHeader?.path ?? nextGnuLongName ?? headerEntryName;
      const linkName = paxHeader?.linkpath ?? nextGnuLongLinkName ?? headerLinkName;
      nextPaxHeader = null;
      nextGnuLongName = null;
      nextGnuLongLinkName = null;
      await extractTarEntry({
        destination,
        entryName,
        typeFlag,
        linkName,
        handle,
        dataStart,
        size,
        mode,
        pendingSymlinks,
      });
      offset = dataStart + roundUpToBlock(size);
    }

    if (!sawEndOfArchive) throw new Error('Invalid tar archive: missing end-of-archive marker');
    await Promise.all(pendingSymlinks.map((symlink) => materializeTarSymlink(symlink)));
  } finally {
    await handle.close();
  }
}

async function extractTarEntry(options: {
  destination: string;
  entryName: string;
  typeFlag: string;
  linkName: string;
  handle: fs.promises.FileHandle;
  dataStart: number;
  size: number;
  mode: number;
  pendingSymlinks: PendingSymlink[];
}): Promise<void> {
  const target = safeTarTarget(options.destination, options.entryName);
  if (options.typeFlag === '5') {
    await fs.promises.mkdir(target, { recursive: true, mode: safeTarMode(options.mode, 0o755) });
    await fs.promises.chmod(target, safeTarMode(options.mode, 0o755));
    return;
  }
  if (options.typeFlag === '2') {
    const link = safeTarSymlinkTarget(options.destination, target, options.linkName);
    await fs.promises.mkdir(path.dirname(target), { recursive: true });
    options.pendingSymlinks.push({ target, entryName: options.entryName, ...link });
    return;
  }
  if (options.typeFlag === '1') {
    throw new Error(`Unsupported tar hardlink for ${options.entryName}`);
  }
  if (options.typeFlag !== '0') {
    throw new Error(`Unsupported tar entry type ${options.typeFlag} for ${options.entryName}`);
  }
  const mode = safeTarMode(options.mode, 0o644);
  await fs.promises.mkdir(path.dirname(target), { recursive: true });
  await writeTarFileData(options.handle, options.dataStart, options.size, target, mode);
  await fs.promises.chmod(target, mode);
}

async function writeTarFileData(
  handle: fs.promises.FileHandle,
  dataStart: number,
  size: number,
  target: string,
  mode: number,
): Promise<void> {
  const output = await fs.promises.open(target, 'w', mode);
  try {
    const buffer = Buffer.alloc(64 * 1024);
    let remaining = size;
    let offset = dataStart;
    while (remaining > 0) {
      const bytesToRead = Math.min(buffer.length, remaining);
      const result = await handle.read(buffer, 0, bytesToRead, offset);
      if (result.bytesRead === 0) throw new Error(`Invalid tar entry ${target}: unexpected end of file`);
      await output.write(buffer, 0, result.bytesRead);
      remaining -= result.bytesRead;
      offset += result.bytesRead;
    }
  } finally {
    await output.close();
  }
}

async function readExactly(handle: fs.promises.FileHandle, offset: number, length: number): Promise<Buffer> {
  const buffer = Buffer.alloc(length);
  const result = await handle.read(buffer, 0, length, offset);
  if (result.bytesRead !== length) throw new Error('Invalid tar archive: unexpected end of file');
  return buffer;
}

function safeTarTarget(destination: string, entryName: string): string {
  if (!entryName || entryName.includes('\0') || entryName.includes('\\')) {
    throw new Error(`Unsafe tar entry path ${entryName}`);
  }
  if (/^[A-Za-z]:/.test(entryName) || path.posix.isAbsolute(entryName)) {
    throw new Error(`Unsafe tar entry path ${entryName}`);
  }
  const normalized = path.posix.normalize(entryName);
  if (normalized === '..' || normalized.startsWith('../') || normalized.includes('/../')) {
    throw new Error(`Unsafe tar entry path ${entryName}`);
  }
  const destinationRoot = path.resolve(destination);
  const target = path.resolve(destinationRoot, ...normalized.split('/'));
  if (target !== destinationRoot && !target.startsWith(destinationRoot + path.sep)) {
    throw new Error(`Unsafe tar entry path ${entryName}`);
  }
  return target;
}

function safeTarMode(mode: number, fallback: number): number {
  const safeMode = mode & 0o777;
  if (safeMode === 0) return fallback;
  return safeMode & 0o755;
}

function safeTarSymlinkTarget(destination: string, targetPath: string, linkName: string): SymlinkTarget {
  if (!linkName || linkName.includes('\0') || linkName.includes('\\')) {
    throw new Error(`Unsafe tar symlink target ${linkName}`);
  }
  if (/^[A-Za-z]:/.test(linkName) || path.posix.isAbsolute(linkName)) {
    throw new Error(`Unsafe tar symlink target ${linkName}`);
  }
  const normalized = path.posix.normalize(linkName);
  const destinationRoot = path.resolve(destination);
  const resolvedTarget = path.resolve(path.dirname(targetPath), ...normalized.split('/'));
  if (resolvedTarget !== destinationRoot && !resolvedTarget.startsWith(destinationRoot + path.sep)) {
    throw new Error(`Unsafe tar symlink target ${linkName}`);
  }
  return { linkName: normalized, resolvedTarget };
}

async function materializeTarSymlink(symlink: PendingSymlink): Promise<void> {
  try {
    await fs.promises.symlink(symlink.linkName, symlink.target);
    return;
  } catch (error) {
    if (!isSymlinkCopyFallbackError(error)) throw error;
  }

  const targetStats = await fs.promises.stat(symlink.resolvedTarget);
  if (targetStats.isDirectory()) {
    await fs.promises.cp(symlink.resolvedTarget, symlink.target, { recursive: true, force: true });
    return;
  }
  if (targetStats.isFile()) {
    await fs.promises.copyFile(symlink.resolvedTarget, symlink.target);
    return;
  }
  throw new Error(`Unsupported tar symlink target type for ${symlink.entryName}`);
}

function isSymlinkCopyFallbackError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) return false;
  return error.code === 'EPERM' || error.code === 'EINVAL' || error.code === 'ENOSYS' || error.code === 'ENOTSUP';
}

interface SymlinkTarget {
  linkName: string;
  resolvedTarget: string;
}

interface PendingSymlink extends SymlinkTarget {
  target: string;
  entryName: string;
}

interface PaxHeader {
  path?: string;
  linkpath?: string;
}

function parseGnuLongValue(data: Buffer): string {
  const end = data.indexOf(0);
  return data.subarray(0, end === -1 ? data.length : end).toString('utf8').trim();
}

function parsePaxHeader(data: Buffer): PaxHeader {
  const result: PaxHeader = {};
  let offset = 0;
  while (offset < data.length) {
    const space = data.indexOf(32, offset);
    if (space === -1) break;
    const length = Number.parseInt(data.subarray(offset, space).toString('utf8'), 10);
    if (!Number.isFinite(length) || length <= 0) break;
    const record = data.subarray(space + 1, offset + length).toString('utf8').replace(/\n$/, '');
    const equals = record.indexOf('=');
    if (equals > 0) {
      const key = record.slice(0, equals);
      const value = record.slice(equals + 1);
      if (key === 'path') result.path = value;
      if (key === 'linkpath') result.linkpath = value;
    }
    offset += length;
  }
  return result;
}

function readTarString(buffer: Buffer, offset: number, length: number): string {
  const slice = buffer.subarray(offset, offset + length);
  const end = slice.indexOf(0);
  return slice.subarray(0, end === -1 ? slice.length : end).toString('utf8').trim();
}

function readTarOctal(buffer: Buffer, offset: number, length: number): number {
  const value = readTarString(buffer, offset, length).replace(/\0/g, '').trim();
  return value ? Number.parseInt(value, 8) : 0;
}

function isZeroBlock(buffer: Buffer): boolean {
  return buffer.every((byte) => byte === 0);
}

function roundUpToBlock(size: number): number {
  return Math.ceil(size / TAR_BLOCK_SIZE) * TAR_BLOCK_SIZE;
}

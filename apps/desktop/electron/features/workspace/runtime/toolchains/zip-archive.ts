import fs from 'fs';
import path from 'path';
import { inflateRawSync } from 'zlib';

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const LOCAL_HEADER_SIGNATURE = 0x04034b50;
const EOCD_MIN_BYTES = 22;
const MAX_COMMENT_BYTES = 0xffff;
const MAX_DECOMPRESSED_ENTRY_BYTES = 2 * 1024 * 1024 * 1024;
const ZIP64_SENTINEL_16 = 0xffff;
const ZIP64_SENTINEL_32 = 0xffffffff;

interface CentralDirectoryEntry {
  name: string;
  compressionMethod: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
  isDirectory: boolean;
}

/**
 * Extract a ZIP archive into a destination directory. The toolchain downloader
 * uses this for upstream releases that publish a `.zip` instead of a `.tar.gz`.
 * The reader supports stored and deflate entries and rejects ZIP64 archives.
 */
export async function unpackZipArchive(archivePath: string, destination: string): Promise<void> {
  const stats = await fs.promises.stat(archivePath);
  if (stats.size > MAX_DECOMPRESSED_ENTRY_BYTES) {
    throw new Error(`Archive ${archivePath} exceeds maximum compressed size`);
  }
  const buffer = await fs.promises.readFile(archivePath);
  const entries = readCentralDirectory(buffer, archivePath);

  await fs.promises.rm(destination, { recursive: true, force: true });
  await fs.promises.mkdir(destination, { recursive: true });
  for (const entry of entries) {
    await extractEntry(buffer, entry, destination, archivePath);
  }
}

function readCentralDirectory(buffer: Buffer, archivePath: string): CentralDirectoryEntry[] {
  const eocdOffset = findEndOfCentralDirectory(buffer);
  if (eocdOffset === -1) throw new Error(`Invalid ZIP archive ${archivePath}: missing end-of-central-directory record`);

  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  const directorySize = buffer.readUInt32LE(eocdOffset + 12);
  const directoryOffset = buffer.readUInt32LE(eocdOffset + 16);
  if (
    entryCount === ZIP64_SENTINEL_16 ||
    directorySize === ZIP64_SENTINEL_32 ||
    directoryOffset === ZIP64_SENTINEL_32
  ) {
    throw new Error(`Unsupported ZIP64 archive ${archivePath}`);
  }
  if (directoryOffset + directorySize > buffer.length) {
    throw new Error(`Invalid ZIP archive ${archivePath}: central directory exceeds archive length`);
  }

  const entries: CentralDirectoryEntry[] = [];
  let offset = directoryOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > buffer.length) throw new Error(`Invalid ZIP archive ${archivePath}: truncated central directory`);
    if (buffer.readUInt32LE(offset) !== CENTRAL_DIRECTORY_SIGNATURE) {
      throw new Error(`Invalid ZIP archive ${archivePath}: bad central directory signature`);
    }
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString('utf8');
    entries.push({
      name,
      compressionMethod: buffer.readUInt16LE(offset + 10),
      compressedSize: buffer.readUInt32LE(offset + 20),
      uncompressedSize: buffer.readUInt32LE(offset + 24),
      localHeaderOffset: buffer.readUInt32LE(offset + 42),
      isDirectory: name.endsWith('/'),
    });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

async function extractEntry(
  buffer: Buffer,
  entry: CentralDirectoryEntry,
  destination: string,
  archivePath: string,
): Promise<void> {
  const target = safeZipTarget(destination, entry.name, archivePath);
  if (entry.isDirectory) {
    await fs.promises.mkdir(target, { recursive: true });
    return;
  }
  if (entry.uncompressedSize > MAX_DECOMPRESSED_ENTRY_BYTES) {
    throw new Error(`ZIP entry ${entry.name} exceeds maximum size`);
  }

  const dataStart = localDataOffset(buffer, entry, archivePath);
  const compressed = buffer.subarray(dataStart, dataStart + entry.compressedSize);
  const data = decompressEntry(compressed, entry, archivePath);

  await fs.promises.mkdir(path.dirname(target), { recursive: true });
  await fs.promises.writeFile(target, data, { mode: 0o755 });
}

function localDataOffset(buffer: Buffer, entry: CentralDirectoryEntry, archivePath: string): number {
  const offset = entry.localHeaderOffset;
  if (offset + 30 > buffer.length || buffer.readUInt32LE(offset) !== LOCAL_HEADER_SIGNATURE) {
    throw new Error(`Invalid ZIP archive ${archivePath}: bad local header for ${entry.name}`);
  }
  const nameLength = buffer.readUInt16LE(offset + 26);
  const extraLength = buffer.readUInt16LE(offset + 28);
  const dataStart = offset + 30 + nameLength + extraLength;
  if (dataStart + entry.compressedSize > buffer.length) {
    throw new Error(`Invalid ZIP archive ${archivePath}: entry ${entry.name} exceeds archive length`);
  }
  return dataStart;
}

function decompressEntry(compressed: Buffer, entry: CentralDirectoryEntry, archivePath: string): Buffer {
  if (entry.compressionMethod === 0) return Buffer.from(compressed);
  if (entry.compressionMethod === 8) {
    return inflateRawSync(compressed, { maxOutputLength: MAX_DECOMPRESSED_ENTRY_BYTES });
  }
  throw new Error(`Unsupported ZIP compression method ${entry.compressionMethod} for ${entry.name} in ${archivePath}`);
}

function findEndOfCentralDirectory(buffer: Buffer): number {
  const earliest = Math.max(0, buffer.length - EOCD_MIN_BYTES - MAX_COMMENT_BYTES);
  for (let offset = buffer.length - EOCD_MIN_BYTES; offset >= earliest; offset -= 1) {
    if (buffer.readUInt32LE(offset) === EOCD_SIGNATURE) return offset;
  }
  return -1;
}

function safeZipTarget(destination: string, entryName: string, archivePath: string): string {
  if (!entryName || entryName.includes('\0') || entryName.includes('\\')) {
    throw new Error(`Unsafe ZIP entry path ${entryName} in ${archivePath}`);
  }
  if (/^[A-Za-z]:/.test(entryName) || path.posix.isAbsolute(entryName)) {
    throw new Error(`Unsafe ZIP entry path ${entryName} in ${archivePath}`);
  }
  const normalized = path.posix.normalize(entryName);
  if (normalized === '..' || normalized.startsWith('../') || normalized.includes('/../')) {
    throw new Error(`Unsafe ZIP entry path ${entryName} in ${archivePath}`);
  }
  const destinationRoot = path.resolve(destination);
  const target = path.resolve(destinationRoot, ...normalized.split('/'));
  if (target !== destinationRoot && !target.startsWith(destinationRoot + path.sep)) {
    throw new Error(`Unsafe ZIP entry path ${entryName} in ${archivePath}`);
  }
  return target;
}

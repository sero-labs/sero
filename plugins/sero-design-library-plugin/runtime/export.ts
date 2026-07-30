import { createHash } from 'node:crypto';
import { mkdir, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { EXPORT_SCHEMA_VERSION, type ExportDestination } from '../shared/export';
import { DESIGN_FONT_OPTIONS, designFontFaces } from '../shared/fonts';
import type { GallerySnapshotAsset, GallerySnapshotFile, GalleryVersionRecord } from '../shared/gallery';
import type { DesignLibraryPaths } from '../shared/paths';
import { galleryVersionDir } from '../shared/paths';
import { readJsonFile, writeJsonFile } from '../shared/state-io';
import type { EmittedFile } from '../shared/targets';
import { tweakCssBlock } from '../shared/tweaks';
import { buildStandaloneDocument } from './build';
import { exportDesignFonts, type ExportedFontFile } from './export-fonts';
import { readGalleryVersion } from './gallery-store';

export const EXPORT_MANIFEST_FILE = 'design-library.json';

export interface RunExportInput {
  exportId: string;
  familyId: string;
  versionId: string;
  destination: ExportDestination;
}

export interface ExportEnvironment {
  workspacePath: string;
  downloadsDir?: string;
  now?: () => number;
}

interface ExportFileRecord {
  file: string;
  bytes: number;
  checksum: string;
}

export interface DesignLibraryExportManifest {
  schemaVersion: number;
  exportId: string;
  exportedAt: number;
  familyId: string;
  versionId: string;
  galleryCreatedAt: number;
  title: string;
  name: string;
  summary: string;
  target: GalleryVersionRecord['target'];
  source: GallerySnapshotFile[];
  assets: GallerySnapshotAsset[];
  fonts: ExportedFontFile[];
  entry: ExportFileRecord;
  effectiveTweaks?: ExportFileRecord;
  tweakManifest?: GalleryVersionRecord['tweakManifest'];
  tweakOverrides: GalleryVersionRecord['tweakOverrides'];
  effectiveTweakValues: GalleryVersionRecord['effectiveTweakValues'];
  dependencies: string[];
  model?: GalleryVersionRecord['model'];
  brief: GalleryVersionRecord['brief'];
  guardrails: GalleryVersionRecord['guardrails'];
  references: GalleryVersionRecord['references'];
  buildWarnings: string[];
}

function checksum(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function fileRecord(file: string, bytes: Uint8Array): ExportFileRecord {
  return { file, bytes: bytes.byteLength, checksum: checksum(bytes) };
}

function slug(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48)
    .toLowerCase() || 'design';
}

function destinationRoot(destination: ExportDestination, environment: ExportEnvironment): string {
  if (destination === 'downloads') return environment.downloadsDir ?? path.join(os.homedir(), 'Downloads');
  if (environment.workspacePath.trim() === '') throw new Error('There is no active workspace for this export.');
  return path.join(environment.workspacePath, 'design-library-exports');
}

async function verifiedFile(
  file: string,
  expected: { bytes: number; checksum: string },
): Promise<Buffer> {
  const bytes = await readFile(file);
  if (bytes.byteLength !== expected.bytes || checksum(bytes) !== expected.checksum) {
    throw new Error(`The Gallery snapshot failed its integrity check: ${path.basename(file)}.`);
  }
  return bytes;
}

async function copySnapshot(
  versionDir: string,
  temporary: string,
  version: GalleryVersionRecord,
): Promise<EmittedFile[]> {
  const emitted: EmittedFile[] = [];
  await mkdir(path.join(temporary, 'source'), { recursive: true });
  for (const file of version.files) {
    const bytes = await verifiedFile(path.join(versionDir, 'source', file.name), file);
    await writeFile(path.join(temporary, 'source', file.name), bytes);
    emitted.push({ name: file.name, content: bytes.toString('utf8') });
  }
  for (const asset of version.assets) {
    const bytes = await verifiedFile(path.join(versionDir, asset.file), asset);
    const output = path.join(temporary, asset.file);
    await mkdir(path.dirname(output), { recursive: true });
    await writeFile(output, bytes);
  }
  return emitted;
}

function selectedFontStacks(version: GalleryVersionRecord, emitted: EmittedFile[]): string[] {
  const effective = ['--font-family', '--body-font'].flatMap((variable) => {
    const value = version.effectiveTweakValues[variable];
    return value === undefined ? [] : [value];
  });
  const source = emitted.map((file) => file.content).join('\n');
  const authored = DESIGN_FONT_OPTIONS.flatMap((option) =>
    designFontFaces(option.value).some((face) => source.includes(face.family)) ? [option.value] : [],
  );
  return [...new Set([...effective, ...authored])];
}

async function existingExport(destination: string, exportId: string): Promise<boolean> {
  const manifest = await readJsonFile<Partial<DesignLibraryExportManifest>>(
    path.join(destination, EXPORT_MANIFEST_FILE),
  );
  return manifest?.exportId === exportId;
}

/** Export one immutable Gallery version without reading its source Design. */
export async function runGalleryExport(
  paths: DesignLibraryPaths,
  input: RunExportInput,
  environment: ExportEnvironment,
): Promise<string> {
  const version = await readGalleryVersion(paths, input.familyId, input.versionId);
  if (!version) throw new Error('That Gallery version is no longer available.');
  const root = destinationRoot(input.destination, environment);
  const folderName = `${slug(version.name || version.title)}-${version.id.slice(0, 8)}-${input.exportId.slice(0, 8)}`;
  const destination = path.join(root, folderName);
  if (await existingExport(destination, input.exportId)) return destination;

  await mkdir(root, { recursive: true });
  if (input.destination === 'workspace') {
    const [workspaceRoot, exportRoot] = await Promise.all([
      realpath(environment.workspacePath),
      realpath(root),
    ]);
    if (exportRoot !== workspaceRoot && !exportRoot.startsWith(`${workspaceRoot}${path.sep}`)) {
      throw new Error('The workspace export folder resolves outside the active workspace.');
    }
  }
  const temporary = path.join(root, `.${folderName}.tmp`);
  await rm(temporary, { recursive: true, force: true });
  await mkdir(temporary, { recursive: true });
  try {
    const versionDir = galleryVersionDir(paths, input.familyId, input.versionId);
    const emitted = await copySnapshot(versionDir, temporary, version);
    const tweakCss = version.tweakManifest
      ? tweakCssBlock(version.tweakManifest, version.tweakOverrides)
      : '';
    if (version.effectiveTweaksFile) {
      const saved = await readFile(path.join(versionDir, version.effectiveTweaksFile), 'utf8');
      if (saved !== tweakCss) throw new Error('The Gallery snapshot Tweaks no longer match its metadata.');
    }
    const fonts = await exportDesignFonts(temporary, selectedFontStacks(version, emitted));
    const built = await buildStandaloneDocument(
      version.target,
      emitted,
      [fonts.css, tweakCss].filter((value) => value !== ''),
    );
    if (!built.document) throw new Error('The saved source could not be built as a standalone page.');

    const entryBytes = Buffer.from(built.document, 'utf8');
    await writeFile(path.join(temporary, 'index.html'), entryBytes);
    let effectiveTweaks: ExportFileRecord | undefined;
    if (tweakCss !== '') {
      const tweakBytes = Buffer.from(tweakCss, 'utf8');
      await writeFile(path.join(temporary, 'effective-tweaks.css'), tweakBytes);
      effectiveTweaks = fileRecord('effective-tweaks.css', tweakBytes);
    }
    const manifest: DesignLibraryExportManifest = {
      schemaVersion: EXPORT_SCHEMA_VERSION,
      exportId: input.exportId,
      exportedAt: (environment.now ?? Date.now)(),
      familyId: version.familyId,
      versionId: version.id,
      galleryCreatedAt: version.createdAt,
      title: version.title,
      name: version.name,
      summary: version.summary,
      target: version.target,
      source: version.files,
      assets: version.assets,
      fonts: fonts.files,
      entry: fileRecord('index.html', entryBytes),
      ...(effectiveTweaks === undefined ? {} : { effectiveTweaks }),
      ...(version.tweakManifest === undefined ? {} : { tweakManifest: version.tweakManifest }),
      tweakOverrides: version.tweakOverrides,
      effectiveTweakValues: version.effectiveTweakValues,
      dependencies: version.dependencyManifest,
      ...(version.model === undefined ? {} : { model: version.model }),
      brief: version.brief,
      guardrails: version.guardrails,
      references: version.references,
      buildWarnings: built.warnings,
    };
    await writeJsonFile(path.join(temporary, EXPORT_MANIFEST_FILE), manifest);
    await rename(temporary, destination);
    return destination;
  } catch (error) {
    await rm(temporary, { recursive: true, force: true });
    throw error;
  }
}

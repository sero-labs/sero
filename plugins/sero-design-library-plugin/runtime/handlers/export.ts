/**
 * Export.
 *
 * Reproduces the saved snapshot exactly: the same source files, the effective
 * tweak values resolved into a standalone page, the bundled assets and a small
 * metadata manifest. Export never regenerates anything and the artefact does
 * not depend on Sero's tweak runtime.
 */

import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { versionDir } from '../../shared/paths';
import { readJsonFile } from '../../shared/state-io';
import type { GalleryVersionSnapshot } from '../../shared/records';
import type { RuntimeHost } from '../host';

export interface ExportInput {
  familyId: string;
  versionId: string;
  destination: 'downloads' | 'workspace';
  workspacePath?: string;
}

function safeFolderName(title: string, versionId: string): string {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  return `${slug || 'design'}-${versionId}`;
}

export function resolveExportRoot(input: ExportInput, homeDir: string): string {
  if (input.destination === 'workspace') {
    if (!input.workspacePath) throw new Error('No workspace path was supplied for a workspace export.');
    return path.join(input.workspacePath, 'design-library-exports');
  }
  return path.join(homeDir, 'Downloads');
}

export async function exportVersion(
  host: RuntimeHost,
  input: ExportInput,
): Promise<{ outputDir: string }> {
  const sourceDir = versionDir(host.paths, input.familyId, input.versionId);
  const snapshot = await readJsonFile<GalleryVersionSnapshot>(path.join(sourceDir, 'version.json'));
  if (!snapshot) throw new Error(`Unknown Gallery version ${input.versionId}.`);

  const outputDir = path.join(
    resolveExportRoot(input, os.homedir()),
    safeFolderName(snapshot.title, snapshot.id),
  );
  await mkdir(path.join(outputDir, 'assets'), { recursive: true });

  for (const file of snapshot.files) {
    const target = path.join(outputDir, file.path);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, file.contents, 'utf8');
  }

  for (const asset of snapshot.assets) {
    await copyFile(
      path.join(sourceDir, 'assets', asset.fileName),
      path.join(outputDir, 'assets', asset.fileName),
    ).catch(() => undefined);
  }

  await copyFile(path.join(sourceDir, 'standalone.html'), path.join(outputDir, 'index.html'))
    .catch(() => undefined);

  await writeFile(
    path.join(outputDir, 'design-library.json'),
    `${JSON.stringify({
      version: snapshot.id,
      family: snapshot.familyId,
      title: snapshot.title,
      outputTarget: snapshot.outputTarget,
      savedAt: snapshot.provenance.savedAt,
      dependencies: snapshot.provenance.dependencies,
      request: snapshot.request,
      guardrails: snapshot.guardrails,
      tweakManifest: snapshot.tweakManifest,
      tweakValues: snapshot.tweakValues,
    }, null, 2)}\n`,
    'utf8',
  );

  return { outputDir };
}

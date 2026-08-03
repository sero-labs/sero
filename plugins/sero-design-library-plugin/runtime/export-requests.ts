import path from 'node:path';

import type { AppRuntimeWorkspaceApi } from '@sero-ai/common';

import type { ExportSummary } from '../shared/export';
import { normalizeExportSummary } from '../shared/export';
import { bumpControlRevision, readIndex, updateIndex } from '../shared/index-storage';
import { normalizeExportIndex } from '../shared/indexes';
import type { DesignLibraryPaths } from '../shared/paths';
import { exportFile } from '../shared/paths';
import type { LibraryRequestBody } from '../shared/requests';
import { readJsonFile, withRecordLock, writeJsonFile } from '../shared/state-io';
import { runGalleryExport } from './export';

type ExportRequestBody = Extract<LibraryRequestBody, { kind: `export.${string}` }>;

export function isExportRequest(body: LibraryRequestBody): body is ExportRequestBody {
  return body.kind.startsWith('export.');
}

export class ExportRequests {
  constructor(
    private readonly paths: DesignLibraryPaths,
    private readonly workspaces: AppRuntimeWorkspaceApi,
  ) {}

  async apply(body: ExportRequestBody): Promise<void> {
    const existing = await this.find(body.exportId);
    const createdAt = existing?.createdAt ?? Date.now();
    await this.publish({
      id: body.exportId,
      familyId: body.familyId,
      versionId: body.versionId,
      destination: body.destination,
      status: 'running',
      createdAt,
    });
    try {
      const outputPath = await runGalleryExport(this.paths, body, {
        workspacePath: await this.workspacePath(body),
      });
      await this.publish({
        id: body.exportId,
        familyId: body.familyId,
        versionId: body.versionId,
        destination: body.destination,
        status: 'succeeded',
        createdAt,
        completedAt: Date.now(),
        path: outputPath,
      });
    } catch (error) {
      await this.publish({
        id: body.exportId,
        familyId: body.familyId,
        versionId: body.versionId,
        destination: body.destination,
        status: 'failed',
        createdAt,
        completedAt: Date.now(),
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async workspacePath(body: ExportRequestBody): Promise<string> {
    if (body.destination !== 'workspace') return '';
    const requested = body.workspacePath?.trim();
    if (!requested) throw new Error('There is no active workspace for this export.');
    const candidate = path.resolve(requested);
    const matches = (await this.workspaces.list())
      .filter((workspace) => {
        if (!workspace.open) return false;
        const root = path.resolve(workspace.path);
        return candidate === root || candidate.startsWith(`${root}${path.sep}`);
      })
      .toSorted((a, b) => b.path.length - a.path.length);
    if (!matches[0]) throw new Error('The requested export path is not inside an open workspace.');
    return matches[0].path;
  }

  private async find(exportId: string): Promise<ExportSummary | undefined> {
    const record = normalizeExportSummary(await readJsonFile<unknown>(exportFile(this.paths, exportId)));
    if (record) return record;
    return (await readIndex(this.paths.exportsIndexFile, normalizeExportIndex))
      .find((entry) => entry.id === exportId);
  }

  private async publish(summary: ExportSummary): Promise<void> {
    const file = exportFile(this.paths, summary.id);
    await withRecordLock(this.paths, file, async () => {
      await writeJsonFile(file, summary);
      await updateIndex(this.paths, this.paths.exportsIndexFile, normalizeExportIndex, summary.id, summary);
      await bumpControlRevision(this.paths);
    });
  }
}

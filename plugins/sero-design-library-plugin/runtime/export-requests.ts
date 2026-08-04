import { readdir, rm } from 'node:fs/promises';
import path from 'node:path';

import type { AppRuntimeWorkspaceApi } from '@sero-ai/common';

import type { ExportSummary } from '../shared/export';
import { normalizeExportSummary } from '../shared/export';
import { bumpControlRevision, readIndex, replaceIndex, updateIndex } from '../shared/index-storage';
import { withIndexRepair } from '../shared/index-repair';
import { normalizeExportIndex } from '../shared/indexes';
import type { DesignLibraryPaths } from '../shared/paths';
import { exportFile } from '../shared/paths';
import type { LibraryRequestBody } from '../shared/requests';
import { readJsonFile, withRecordLock, writeJsonFile } from '../shared/state-io';
import { runGalleryExport } from './export';

type ExportRequestBody = Extract<LibraryRequestBody, { kind: `export.${string}` }>;

const MAX_EXPORT_HISTORY = 20;
const INTERRUPTED_EXPORT_ERROR = 'The export was interrupted by a Sero restart.';

async function writeExportSummaryLocked(
  paths: DesignLibraryPaths,
  summary: ExportSummary,
): Promise<void> {
  await withIndexRepair(paths, 'exports', summary.id, async () => {
    await writeJsonFile(exportFile(paths, summary.id), summary);
    await updateIndex(paths, paths.exportsIndexFile, normalizeExportIndex, summary.id, summary);
    await bumpControlRevision(paths);
  });
}

async function writeExportSummary(
  paths: DesignLibraryPaths,
  summary: ExportSummary,
): Promise<void> {
  const file = exportFile(paths, summary.id);
  await withRecordLock(paths, file, () => writeExportSummaryLocked(paths, summary));
}

export async function reindexExports(
  paths: DesignLibraryPaths,
  notify = true,
): Promise<string[]> {
  const names = (await readdir(paths.exportsDir).catch(() => []))
    .filter((name) => name.endsWith('.json') && name !== 'index.json');
  const records = await Promise.all(names.map((name) =>
    readJsonFile<unknown>(path.join(paths.exportsDir, name)).then(normalizeExportSummary)));
  const exports = records.filter((record): record is ExportSummary => record !== null);
  await replaceIndex(paths, paths.exportsIndexFile, normalizeExportIndex, exports);
  if (notify) await bumpControlRevision(paths);
  return names.filter((_, index) => records[index] === null);
}

export async function pruneExportHistory(
  paths: DesignLibraryPaths,
  maximum = MAX_EXPORT_HISTORY,
): Promise<number> {
  const history = (await readIndex(paths.exportsIndexFile, normalizeExportIndex))
    .filter((summary) => summary.status !== 'running')
    .toSorted((left, right) => left.createdAt - right.createdAt);
  const keep = Math.max(0, Math.floor(maximum));
  const expired = history.slice(0, Math.max(0, history.length - keep));
  let removed = 0;
  for (const summary of expired) {
    const file = exportFile(paths, summary.id);
    const deleted = await withRecordLock(paths, file, async () => {
      const current = normalizeExportSummary(await readJsonFile<unknown>(file));
      if (current?.status === 'running') return false;
      await withIndexRepair(paths, 'exports', summary.id, async () => {
        await rm(file, { force: true });
        await updateIndex(paths, paths.exportsIndexFile, normalizeExportIndex, summary.id, null);
        await bumpControlRevision(paths);
      });
      return true;
    });
    if (deleted) removed += 1;
  }
  return removed;
}

/** Settle exports that could not publish a terminal state before shutdown. */
export async function reconcileExports(
  paths: DesignLibraryPaths,
  completedAt = Date.now(),
  pendingExportIds: ReadonlySet<string> = new Set(),
): Promise<{ reconciled: number; unreadable: string[] }> {
  const running = (await readIndex(paths.exportsIndexFile, normalizeExportIndex))
    .filter((summary) => summary.status === 'running' && !pendingExportIds.has(summary.id));
  let reconciled = 0;
  const unreadable: string[] = [];

  for (const summary of running) {
    const file = exportFile(paths, summary.id);
    const changed = await withRecordLock(paths, file, async () => {
      const current = normalizeExportSummary(await readJsonFile<unknown>(file));
      if (!current) {
        unreadable.push(summary.id);
        return false;
      }
      if (current.status !== 'running') {
        const updated = await updateIndex(
          paths,
          paths.exportsIndexFile,
          normalizeExportIndex,
          summary.id,
          current,
        );
        if (updated) await bumpControlRevision(paths);
        return false;
      }
      await writeExportSummaryLocked(paths, {
        ...current,
        status: 'failed',
        completedAt,
        error: INTERRUPTED_EXPORT_ERROR,
      });
      return true;
    });
    if (changed) reconciled += 1;
  }
  return { reconciled, unreadable };
}

export function isExportRequest(body: LibraryRequestBody): body is ExportRequestBody {
  return body.kind.startsWith('export.');
}

export class ExportRequests {
  constructor(
    private readonly paths: DesignLibraryPaths,
    private readonly workspaces: AppRuntimeWorkspaceApi,
    private readonly onError: (message: string, error: unknown) => void = () => undefined,
    private readonly pruneHistory: typeof pruneExportHistory = pruneExportHistory,
  ) {}

  async apply(body: ExportRequestBody): Promise<void> {
    const existing = await this.find(body.exportId);
    if (existing?.status === 'succeeded' || existing?.status === 'failed') {
      // The request may have completed before its watermark write failed.
      // Re-publish the durable terminal record without running the export again.
      await this.publish(existing);
      await this.pruneAfterTerminalPublish();
      return;
    }
    const createdAt = existing?.createdAt ?? Date.now();
    await this.publish({
      id: body.exportId,
      familyId: body.familyId,
      versionId: body.versionId,
      destination: body.destination,
      status: 'running',
      createdAt,
    });
    let terminal: ExportSummary;
    try {
      const outputPath = await runGalleryExport(this.paths, body, {
        workspacePath: await this.workspacePath(body),
      });
      terminal = {
        id: body.exportId,
        familyId: body.familyId,
        versionId: body.versionId,
        destination: body.destination,
        status: 'succeeded',
        createdAt,
        completedAt: Date.now(),
        path: outputPath,
      };
    } catch (error) {
      terminal = {
        id: body.exportId,
        familyId: body.familyId,
        versionId: body.versionId,
        destination: body.destination,
        status: 'failed',
        createdAt,
        completedAt: Date.now(),
        error: error instanceof Error ? error.message : String(error),
      };
    }
    await this.publish(terminal);
    await this.pruneAfterTerminalPublish();
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
    await writeExportSummary(this.paths, summary);
  }

  private async pruneAfterTerminalPublish(): Promise<void> {
    try {
      await this.pruneHistory(this.paths);
    } catch (error) {
      this.onError('Could not prune Design Library export history', error);
    }
  }
}

import { randomUUID } from 'node:crypto';

import { StringEnum } from '@earendil-works/pi-ai';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';

import { readIndex } from '../../shared/index-storage';
import { normalizeExportIndex } from '../../shared/indexes';
import { isExportDestination } from '../../shared/export';
import { normalizeGalleryVersion } from '../../shared/gallery';
import type { DesignLibraryPaths } from '../../shared/paths';
import { galleryVersionRecordFile } from '../../shared/paths';
import { appendRequest, readJsonFile } from '../../shared/state-io';
import { checkId, failure, text, type ToolResult } from './result';

const ACTIONS = ['run', 'status'] as const;
const DESTINATIONS = ['downloads', 'workspace'] as const;

function required(value: string | undefined, label: string): { id: string } | { error: ToolResult } {
  return checkId(value, label);
}

export function registerExportTool(pi: ExtensionAPI, paths: DesignLibraryPaths): void {
  pi.registerTool({
    name: 'design_library_export',
    label: 'Design Library Export',
    description: 'Export an exact immutable Gallery version to Downloads or the active workspace.',
    parameters: Type.Object({
      action: StringEnum(ACTIONS),
      familyId: Type.Optional(Type.String()),
      versionId: Type.Optional(Type.String()),
      exportId: Type.Optional(Type.String()),
      destination: Type.Optional(StringEnum(DESTINATIONS)),
      workspacePath: Type.Optional(Type.String()),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, context): Promise<ToolResult> {
      if (params.action === 'status') {
        const exports = await readIndex(paths.exportsIndexFile, normalizeExportIndex);
        const selected = params.exportId
          ? exports.find((entry) => entry.id === params.exportId)
          : exports.at(-1);
        if (!selected) return text('No exports have run yet.', { exports });
        return text(
          selected.status === 'succeeded'
            ? `Exported to ${selected.path}.`
            : selected.status === 'failed'
              ? `Export failed: ${selected.error}`
              : 'Export is running.',
          { export: selected },
        );
      }

      const family = required(params.familyId, 'family id');
      if ('error' in family) return family.error;
      const version = required(params.versionId, 'version id');
      if ('error' in version) return version.error;
      if (!isExportDestination(params.destination)) {
        return failure('Destination must be `downloads` or `workspace`.');
      }
      const record = normalizeGalleryVersion(
        await readJsonFile<unknown>(galleryVersionRecordFile(paths, family.id, version.id)),
      );
      if (!record) return failure('No such Gallery version.');
      const exportId = randomUUID();
      await appendRequest(paths, {
        kind: 'export.run',
        exportId,
        familyId: family.id,
        versionId: version.id,
        destination: params.destination,
        ...(params.destination === 'workspace'
          ? { workspacePath: params.workspacePath ?? context?.cwd }
          : {}),
      });
      return text(
        params.destination === 'downloads'
          ? 'Exporting that exact Gallery version to Downloads.'
          : 'Exporting that exact Gallery version to the active workspace.',
        { exportId },
      );
    },
  });
}

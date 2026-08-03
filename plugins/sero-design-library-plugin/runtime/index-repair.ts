import {
  clearIndexRepair,
  listPendingIndexRepairs,
  type PendingIndexRepair,
} from '../shared/index-repair';
import { bumpControlRevision, updateIndex } from '../shared/index-storage';
import { normalizeExportSummary } from '../shared/export';
import {
  normalizeDesignIndex,
  normalizeExportIndex,
  normalizeGalleryIndex,
  normalizeItemIndex,
} from '../shared/indexes';
import type { DesignLibraryPaths } from '../shared/paths';
import { designRecordFile, exportFile, galleryFamilyRecordFile, itemRecordFile } from '../shared/paths';
import { readJsonFile, withRecordLock } from '../shared/state-io';
import { readDesign } from './design-store';
import { readGalleryFamily } from './gallery-store';
import { projectDesign, projectItem } from './projection';
import { previewPathFor, readItem } from './store';

function repairRecordFile(paths: DesignLibraryPaths, repair: PendingIndexRepair): string {
  switch (repair.index) {
    case 'items': return itemRecordFile(paths, repair.id);
    case 'designs': return designRecordFile(paths, repair.id);
    case 'gallery': return galleryFamilyRecordFile(paths, repair.id);
    case 'exports': return exportFile(paths, repair.id);
  }
}

/**
 * Replay only writes left in the crash journal. A clean start reads no entity
 * records, while an interrupted write repairs its exact index entry.
 */
export async function repairPendingIndexes(paths: DesignLibraryPaths): Promise<number> {
  const pending = await listPendingIndexRepairs(paths);
  if (pending.length === 0) return 0;

  for (const repair of pending) {
    await withRecordLock(paths, repairRecordFile(paths, repair), async () => {
      switch (repair.index) {
        case 'items': {
          const item = await readItem(paths, repair.id);
          await updateIndex(
            paths,
            paths.itemsIndexFile,
            normalizeItemIndex,
            repair.id,
            item ? projectItem(item, previewPathFor(item)) : null,
          );
          break;
        }
        case 'designs': {
          const design = await readDesign(paths, repair.id);
          await updateIndex(
            paths,
            paths.designsIndexFile,
            normalizeDesignIndex,
            repair.id,
            design ? projectDesign(design) : null,
          );
          break;
        }
        case 'gallery': {
          const family = await readGalleryFamily(paths, repair.id);
          await updateIndex(
            paths,
            paths.galleryIndexFile,
            normalizeGalleryIndex,
            repair.id,
            family,
          );
          break;
        }
        case 'exports': {
          const summary = normalizeExportSummary(
            await readJsonFile<unknown>(exportFile(paths, repair.id)),
          );
          await updateIndex(
            paths,
            paths.exportsIndexFile,
            normalizeExportIndex,
            repair.id,
            summary,
          );
          break;
        }
      }
      // The marker belongs to this record transaction. Keep the record lock
      // until both the notification and marker removal are durable, so a new
      // writer cannot start between replay and cleanup.
      await bumpControlRevision(paths);
      await clearIndexRepair(paths, repair.index, repair.id);
    });
  }
  return pending.length;
}

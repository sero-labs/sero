import type { ArchitectHost } from './host';
import type { RecordStore } from './record-store';
import type { ProjectsOutcome } from './projects-actions';
import { ensureOpenSpec } from './openspec';

/** Opt an existing maintenance project into later OpenSpec changes. */
export function createEnableOpenSpecAction(host: ArchitectHost, store: RecordStore): (projectId: string) => Promise<ProjectsOutcome> {
  return async (projectId) => {
    const record = await store.read(projectId);
    if (!record) return { ok: false, text: `No project ${projectId}.` };
    if (record.openSpecEnabled) return { ok: true, text: 'OpenSpec is already enabled for this project.' };
    if (record.phase !== 'maintain') return { ok: false, text: 'Enable OpenSpec for later changes once this project reaches maintenance.' };
    if (record.executionMode !== 'workspace') return { ok: false, text: 'The OpenSpec proof of concept requires Workspace execution.' };
    try {
      await ensureOpenSpec(host, record.folder);
    } catch (error) {
      return { ok: false, text: error instanceof Error ? error.message : String(error) };
    }
    const saved = await store.update(projectId, (fresh) => fresh.phase === 'maintain' && fresh.executionMode === 'workspace'
      ? { ...fresh, openSpecEnabled: true } : null);
    return saved ? { ok: true, text: 'OpenSpec enabled. Start a change from the project page.' }
      : { ok: false, text: 'The project changed during OpenSpec setup. Review its execution mode and try again.' };
  };
}

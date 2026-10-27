import type { PersistentSessionsApi } from '@sero-ai/common';
import type { ProjectRecord } from '../shared/record';
import type { RecordStore } from './record-store';

/** A signal for one owned operation, including a stop during its preparation. */
export async function withProjectCancellation<T>(store: RecordStore, projectId: string, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const observe = (record: ProjectRecord) => {
    if (record.id === projectId && (record.blockedReason === 'stopped by the user'
      || (record.budget.capUsd !== null && record.budget.spentUsd >= record.budget.capUsd))) controller.abort();
  };
  const detach = store.subscribe(observe);
  try {
    const record = await store.read(projectId);
    if (record) observe(record);
    else controller.abort();
    return await run(controller.signal);
  } finally { detach(); }
}


/** Match the host subagent abort grace; unresponsive tools must not hang Stop. */
export async function abortOwner(api: Pick<PersistentSessionsApi, 'abort'>, handleId: string): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      api.abort(handleId),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('Owner cancellation was not confirmed within 15 seconds.')), 15_000);
      }),
    ]);
  } finally { if (timer) clearTimeout(timer); }
}

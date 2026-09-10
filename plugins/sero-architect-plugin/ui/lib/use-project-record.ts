/**
 * Watches one project record through the host's app-state bridge. The index
 * is the app's own state file; the record sits beside it under `projects/`,
 * the layout the runtime's record store writes. Push only: the bridge tells
 * the page when the runtime writes, and nothing polls.
 */

import { use, useEffect, useState } from 'react';
import { AppContext, getSeroApi } from '@sero-ai/app-runtime';

import type { ProjectRecord } from '../../shared/record';

export function projectRecordPath(stateFilePath: string, projectId: string): string {
  const separator = stateFilePath.includes('\\') && !stateFilePath.includes('/') ? '\\' : '/';
  const dir = stateFilePath.slice(0, stateFilePath.lastIndexOf(separator));
  return `${dir}${separator}projects${separator}${projectId}.json`;
}

function isRecord(value: unknown): value is ProjectRecord {
  return typeof value === 'object' && value !== null && (value as { version?: unknown }).version === 1
    && typeof (value as { id?: unknown }).id === 'string';
}

export interface ProjectRecordView {
  record: ProjectRecord | null;
  /** False until the first read answers, so a missing record is not shown as "no project" too early. */
  ready: boolean;
}

export function useProjectRecord(projectId: string | null): ProjectRecordView {
  const ctx = use(AppContext);
  const stateFilePath = ctx?.stateFilePath ?? '';
  const filePath = projectId && stateFilePath ? projectRecordPath(stateFilePath, projectId) : null;
  const [view, setView] = useState<{ filePath: string | null; record: ProjectRecord | null; ready: boolean }>({
    filePath,
    record: null,
    ready: false,
  });

  useEffect(() => {
    if (!filePath) return;
    let active = true;
    const { appState } = getSeroApi();
    const apply = (data: unknown) => {
      if (!active) return;
      setView({ filePath, record: isRecord(data) ? data : null, ready: true });
    };
    const unsubscribe = appState.onChange((changedPath, data) => {
      if (changedPath === filePath) apply(data);
    });
    void appState.watch(filePath).then(({ data }) => apply(data)).catch(() => apply(null));
    return () => {
      active = false;
      unsubscribe();
      void appState.unwatch(filePath);
    };
  }, [filePath]);

  if (view.filePath !== filePath) return { record: null, ready: false };
  return { record: view.record, ready: view.ready };
}

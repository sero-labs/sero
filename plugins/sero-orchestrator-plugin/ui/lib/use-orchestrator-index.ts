import { use, useMemo } from 'react';
import { AppContext } from '@sero-ai/app-runtime';
import { DEFAULT_INDEX } from '../../shared/defaults';
import type { OrchestratorIndex } from '../../shared/types';
import { useWatchedJson } from './use-watched-json';

/** Directory of a file path, tolerant of either separator (renderer has no node:path). */
export function dirOf(filePath: string): string {
  const i = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
  return i >= 0 ? filePath.slice(0, i) : '';
}

/**
 * The current workspace's orchestrator state directory (parent of state.json),
 * where index.json and loops/<id>/loop.json live. Empty when no workspace is
 * mounted. The single source for both the app view and the dashboard widgets.
 */
export function useStateDir(): string {
  const ctx = use(AppContext);
  return useMemo(() => dirOf(ctx?.stateFilePath ?? ''), [ctx?.stateFilePath]);
}

/**
 * Follows the orchestrator's watched loop index (index.json) for the current
 * workspace — the same file OrchestratorApp's home view watches, so widgets
 * update live without reading any loop file.
 */
export function useOrchestratorIndex(): OrchestratorIndex {
  const stateDir = useStateDir();
  return useWatchedJson<OrchestratorIndex>(stateDir ? `${stateDir}/index.json` : null, DEFAULT_INDEX);
}

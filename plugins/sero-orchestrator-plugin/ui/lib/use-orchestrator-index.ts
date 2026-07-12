import { use, useMemo } from 'react';
import { AppContext } from '@sero-ai/app-runtime';
import { DEFAULT_INDEX } from '../../shared/defaults';
import type { OrchestratorIndex } from '../../shared/types';
import { useWatchedJson } from './use-watched-json';

/** Directory of a file path, tolerant of either separator (renderer has no node:path). */
function dirOf(filePath: string): string {
  const i = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
  return i >= 0 ? filePath.slice(0, i) : '';
}

/**
 * Follows the orchestrator's watched loop index (index.json) for the current
 * workspace — the same file OrchestratorApp's home view watches, so widgets
 * update live without reading any loop file.
 */
export function useOrchestratorIndex(): OrchestratorIndex {
  const ctx = use(AppContext);
  const stateDir = useMemo(() => dirOf(ctx?.stateFilePath ?? ''), [ctx?.stateFilePath]);
  return useWatchedJson<OrchestratorIndex>(stateDir ? `${stateDir}/index.json` : null, DEFAULT_INDEX);
}

import { createContext, use, type Context } from 'react';
import type { OrchestratorState } from '../../shared/types';

export interface OrchestratorStateRuntime {
  state: OrchestratorState;
  updateState: (updater: (previous: OrchestratorState) => OrchestratorState) => void;
  ready: boolean;
}

export const OrchestratorStateContext: Context<OrchestratorStateRuntime | null> =
  createContext<OrchestratorStateRuntime | null>(null);

export function useOrchestratorState(): OrchestratorStateRuntime {
  const runtime = use(OrchestratorStateContext);
  if (!runtime) throw new Error('useOrchestratorState requires OrchestratorStateContext');
  return runtime;
}

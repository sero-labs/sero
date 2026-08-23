/**
 * Loop warnings. Split from types.ts (500-LOC limit) and re-exported there so
 * existing imports keep resolving.
 */

export interface LoopWarning {
  id: string;
  code:
    | 'mixed-workspace-targets'
    | 'model-unavailable'
    | 'agent-unavailable'
    | 'event-chain-depth'
    | 'event-dropped'
    | 'event-queue-overflow'
    | 'delivery-tool-missing'
    | 'catalog-tool-missing';
  message: string;
  /** The step a runtime warning refers to (model/agent-unavailable), for de-duplication. */
  stepId?: string;
  createdAt: string;
}

/** File-backed Orchestrator UI preferences. */
export interface OrchestratorUiState {
  /** Last meaningful view, shared with shell navigation when supported. */
  navigationViewId?: string;
  /** Stages the plan map puts in one row (1 to 4). */
  planStepsPerRow?: number;
  roomPanelLayouts?: {
    roster?: Record<string, number>;
    rosterAndDetails?: Record<string, number>;
  };
}

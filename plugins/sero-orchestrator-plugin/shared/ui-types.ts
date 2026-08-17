/** File-backed Orchestrator UI preferences. */
export interface OrchestratorUiState {
  /** Last meaningful view, shared with shell navigation when supported. */
  navigationViewId?: string;
  roomPanelLayouts?: {
    roster?: Record<string, number>;
    rosterAndDetails?: Record<string, number>;
  };
}

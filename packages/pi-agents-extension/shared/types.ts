/**
 * State for the Agents app — minimal UI metadata only.
 * Agent content lives in ~/.sero-ui/agent/agents/*.md files,
 * read/written via IPC.
 */

export interface AgentsAppState {
  /** Currently selected agent name (null = none). */
  selectedAgent: string | null;
}

export const DEFAULT_STATE: AgentsAppState = {
  selectedAgent: null,
};

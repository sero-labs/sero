/** Agent summary (from listAgents IPC). */
export interface AgentSummary {
  name: string;
  description: string;
  model?: string;
  thinking?: string;
  timeoutMs?: number;
}

/** Full agent file data (from readAgent IPC). */
export interface AgentFileData {
  name: string;
  description: string;
  model?: string;
  thinking?: string;
  timeoutMs?: number;
  tools?: string[];
  systemPrompt: string;
}

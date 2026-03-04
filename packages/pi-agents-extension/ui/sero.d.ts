/** Minimal window.sero type declaration for the Agents app. */

interface AgentSummaryIPC {
  name: string;
  description: string;
  model?: string;
  thinking?: string;
  timeoutMs?: number;
}

interface AgentFileDataIPC {
  name: string;
  description: string;
  model?: string;
  thinking?: string;
  timeoutMs?: number;
  tools?: string[];
  systemPrompt: string;
}

interface SeroSubagentBridge {
  listAgents(): Promise<AgentSummaryIPC[]>;
  readAgent(name: string): Promise<AgentFileDataIPC>;
  writeAgent(data: AgentFileDataIPC): Promise<void>;
  deleteAgent(name: string): Promise<void>;
}

interface Window {
  sero: {
    subagent: SeroSubagentBridge;
  };
}

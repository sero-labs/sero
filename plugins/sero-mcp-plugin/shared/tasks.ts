/** One task row for the MCP app, from `mcp_manager` `list_tasks`. */
export interface McpTaskSummary {
  taskId: string;
  serverName: string;
  toolName: string;
  status: 'working' | 'input_required' | 'completed' | 'failed' | 'cancelled' | 'disconnected' | 'blocked-principal';
  statusMessage: string | null;
  createdAt: string;
  updatedAt: string;
  resultText: string | null;
  isError: boolean;
  lastError: string | null;
}

export const ACTIVE_TASK_STATUSES: ReadonlySet<McpTaskSummary['status']> = new Set(['working', 'input_required', 'disconnected']);

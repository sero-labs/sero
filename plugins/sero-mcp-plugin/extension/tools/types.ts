export const MCP_MANAGER_ACTIONS = [
  'bootstrap',
  'refresh',
  'get_raw_config',
  'save_raw_config',
  'get_diagnostics',
  'upsert_server',
  'remove_server',
  'enable_server',
  'disable_server',
  'connect_server',
  'reconnect_server',
  'start_auth',
  'complete_auth',
  'cancel_auth',
  'clear_auth',
  'read_resource',
  'open_resource',
  'open_tool_ui',
  'close_viewer',
] as const;

export type ManagerAction = (typeof MCP_MANAGER_ACTIONS)[number] | 'status';
export type ProxyAction = 'status' | 'list' | 'search' | 'list_tools' | 'list_resources' | 'describe_tool' | 'call_tool' | 'read_resource';

export type ToolResult = {
  content: Array<{ type: 'text'; text: string }>;
  details: Record<string, unknown>;
};

export type CliResult = {
  output: string;
  exitCode: number;
};

export type CliContext = {
  cwd: string;
};

export function isManagerAction(value: string): value is ManagerAction {
  return value === 'status' || MCP_MANAGER_ACTIONS.includes(value as (typeof MCP_MANAGER_ACTIONS)[number]);
}

export function createToolResult(text: string, details: Record<string, unknown> = {}): ToolResult {
  return {
    content: [{ type: 'text', text }],
    details,
  };
}

export type ManagerAction =
  | 'bootstrap'
  | 'refresh'
  | 'get_raw_config'
  | 'save_raw_config'
  | 'get_diagnostics'
  | 'upsert_server'
  | 'remove_server'
  | 'enable_server'
  | 'disable_server'
  | 'connect_server'
  | 'reconnect_server'
  | 'start_auth'
  | 'complete_auth'
  | 'cancel_auth'
  | 'clear_auth'
  | 'read_resource';
export type ProxyAction = 'status' | 'list' | 'search' | 'list_tools' | 'describe_tool' | 'call_tool';

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

export function createToolResult(text: string, details: Record<string, unknown> = {}): ToolResult {
  return {
    content: [{ type: 'text', text }],
    details,
  };
}

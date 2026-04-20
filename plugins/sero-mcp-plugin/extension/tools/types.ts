export type ManagerAction = 'bootstrap' | 'refresh' | 'get_raw_config' | 'save_raw_config' | 'get_diagnostics';
export type ProxyAction = 'status' | 'list';

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

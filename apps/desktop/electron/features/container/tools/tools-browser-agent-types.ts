export interface AgentBrowserJson {
  success?: boolean;
  message?: string;
  error?: string;
  warning?: string;
  title?: string;
  url?: string;
  text?: string;
  output?: string;
  snapshot?: string;
  screenshot?: string;
  path?: string;
  running?: boolean;
  result?: unknown;
  refs?: Record<string, unknown>;
  data?: unknown;
}

export interface AgentCommandOptions {
  execTimeoutMs?: number;
  defaultActionTimeoutMs?: number;
}

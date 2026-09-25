import type { McpUiResourceCsp, McpUiResourcePermissions } from '@modelcontextprotocol/ext-apps/app-bridge';

export interface UiResourceMeta {
  csp?: McpUiResourceCsp;
  permissions?: McpUiResourcePermissions;
  domain?: string;
  prefersBorder?: boolean;
}

export interface UiResourceContent {
  uri: string;
  html: string;
  mimeType: string;
  meta: UiResourceMeta;
}

export interface UiToolInfo {
  name: string;
  description?: string;
  inputSchema?: unknown;
}

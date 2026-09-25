/** The viewer page puts this JSON in a script tag. The bundled shell reads it. */
export interface ViewerShellConfig {
  token: string;
  allowAttribute: string;
  toolArgs: Record<string, unknown>;
  /** The tool result, when the app shows the result of a finished call. */
  toolResult?: Record<string, unknown>;
  hostContext: Record<string, unknown>;
  /** True when the app is shown in a chat, so it can send messages and model context to that chat. */
  chat: boolean;
}

export const VIEWER_SHELL_CONFIG_ID = 'sero-viewer-config';
export const VIEWER_SHELL_SCRIPT = 'viewer-shell.js';

/** Posted to the window that embeds the viewer page, so it can fit the frame to the app. */
export interface ViewerSizeMessage {
  type: 'sero-mcp-viewer-size';
  height: number;
}

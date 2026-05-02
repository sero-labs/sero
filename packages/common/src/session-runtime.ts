/**
 * Session-runtime bridge types shared between the desktop host and plugins.
 * Keep renderer-safe and free of desktop-/Electron-specific imports.
 */

export interface ExtensionRuntimeTextContent {
  type: 'text';
  text: string;
}

export interface ExtensionRuntimeImageContent {
  type: 'image';
  data: string;
  mimeType: string;
}

export type ExtensionRuntimeContentBlock =
  | ExtensionRuntimeTextContent
  | ExtensionRuntimeImageContent;

export type ExtensionRuntimeContent = string | ExtensionRuntimeContentBlock[];

export interface ExtensionRuntimeMessage {
  customType: string;
  content: ExtensionRuntimeContent;
  display: boolean;
  details?: unknown;
}

/**
 * Narrow execution-scoped runtime forwarded into bridged extension execution.
 * This stays intentionally small so plugins do not depend on raw host internals.
 */
export interface ExtensionSessionRuntime {
  sendUserMessage: (
    content: ExtensionRuntimeContent,
    options?: { deliverAs?: 'steer' | 'followUp' },
  ) => void | Promise<void>;
  sendMessage: (
    message: ExtensionRuntimeMessage,
    options?: { triggerTurn?: boolean; deliverAs?: 'steer' | 'followUp' | 'nextTurn' },
  ) => void | Promise<void>;
}

/**
 * Sero's ExtensionUIContext implementation.
 *
 * Provides a real `notify()` that shows desktop notifications.
 * All other methods are no-ops for now — Sero's UI is React-based,
 * not TUI-based, so TUI-specific methods (setWidget, setFooter, etc.)
 * don't apply. They can be wired up to IPC in the future if needed.
 *
 * Compatible with the Pi SDK's ExtensionUIContext interface.
 */

import { Theme, type ExtensionUIContext, type ThemeColor } from '@mariozechner/pi-coding-agent';
import { showNotification } from '@electron/platform/desktop/notifications';

const SERO_UI_THEME_COLORS: Record<ThemeColor, string> = {
  accent: '#7c3aed',
  border: '#2d2d2d',
  borderAccent: '#4c1d95',
  borderMuted: '#1f1f1f',
  success: '#10b981',
  error: '#ef4444',
  warning: '#f59e0b',
  muted: '#6b7280',
  dim: '#4b5563',
  text: '#f9fafb',
  thinkingText: '#d1d5db',
  userMessageText: '#f9fafb',
  customMessageText: '#f9fafb',
  customMessageLabel: '#c084fc',
  toolTitle: '#c4b5fd',
  toolOutput: '#e5e7eb',
  mdHeading: '#f9fafb',
  mdLink: '#60a5fa',
  mdLinkUrl: '#93c5fd',
  mdCode: '#fca5a5',
  mdCodeBlock: '#e5e7eb',
  mdCodeBlockBorder: '#374151',
  mdQuote: '#d1d5db',
  mdQuoteBorder: '#4b5563',
  mdHr: '#374151',
  mdListBullet: '#a78bfa',
  toolDiffAdded: '#34d399',
  toolDiffRemoved: '#f87171',
  toolDiffContext: '#9ca3af',
  syntaxComment: '#6b7280',
  syntaxKeyword: '#c084fc',
  syntaxFunction: '#60a5fa',
  syntaxVariable: '#f9fafb',
  syntaxString: '#86efac',
  syntaxNumber: '#fdba74',
  syntaxType: '#67e8f9',
  syntaxOperator: '#f9fafb',
  syntaxPunctuation: '#d1d5db',
  thinkingOff: '#6b7280',
  thinkingMinimal: '#60a5fa',
  thinkingLow: '#34d399',
  thinkingMedium: '#f59e0b',
  thinkingHigh: '#f97316',
  thinkingXhigh: '#ef4444',
  bashMode: '#22c55e',
};

const SERO_UI_THEME_BACKGROUNDS: ConstructorParameters<typeof Theme>[1] = {
  selectedBg: '#312e81',
  userMessageBg: '#111827',
  customMessageBg: '#111827',
  toolPendingBg: '#1f2937',
  toolSuccessBg: '#052e16',
  toolErrorBg: '#450a0a',
};

const SERO_UI_THEME = new Theme(
  SERO_UI_THEME_COLORS,
  SERO_UI_THEME_BACKGROUNDS,
  'truecolor',
  { name: 'sero-extension-ui' },
);

function unsupportedCustom<T>(..._args: Parameters<ExtensionUIContext['custom']>): Promise<T> {
  // Sero does not host Pi's TUI overlay system. Preserve the existing no-op
  // runtime behavior by resolving `undefined` without invoking the factory.
  return Promise.resolve(undefined!);
}

/**
 * Create an ExtensionUIContext for Sero sessions.
 *
 * Call `session.extensionRunner?.setUIContext(createSeroUIContext())`
 * after creating the session so all extension event handlers and
 * command contexts receive a working `ctx.ui`.
 */
export function createSeroUIContext(): ExtensionUIContext {
  return {
    // ── Dialogs (no-op — would need IPC to renderer) ─────

    select: async () => undefined,
    confirm: async () => false,
    input: async () => undefined,

    // ── Notifications (real implementation) ──────────────

    notify(message: string, type?: 'info' | 'warning' | 'error'): void {
      showNotification(message, type ?? 'info');
    },

    // ── Terminal input (not applicable in Sero) ──────────

    onTerminalInput: () => () => {},

    // ── Status / UI (no-op for now) ──────────────────────

    setStatus: () => {},
    setWorkingMessage: () => {},
    setWidget: () => {},
    setFooter: () => {},
    setHeader: () => {},
    setTitle: () => {},

    // ── Custom components (no-op) ────────────────────────

    custom: unsupportedCustom,

    // ── Editor (no-op) ───────────────────────────────────

    pasteToEditor: () => {},
    setEditorText: () => {},
    getEditorText: () => '',
    editor: async () => undefined,
    setEditorComponent: () => {},

    // ── Theme (stubs) ────────────────────────────────────

    get theme(): ExtensionUIContext['theme'] {
      return SERO_UI_THEME;
    },
    getAllThemes: () => [],
    getTheme: () => undefined,
    setTheme: () => ({ success: false, error: 'Not supported in Sero' }),

    // ── Tool expansion (no-op) ───────────────────────────

    getToolsExpanded: () => false,
    setToolsExpanded: () => {},
  };
}

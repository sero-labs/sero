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

import type { ExtensionUIContext } from '@mariozechner/pi-coding-agent';
import { showNotification } from '../../../platform/desktop/notifications';

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

    custom: async () => undefined as never,

    // ── Editor (no-op) ───────────────────────────────────

    pasteToEditor: () => {},
    setEditorText: () => {},
    getEditorText: () => '',
    editor: async () => undefined,
    setEditorComponent: () => {},

    // ── Theme (stubs) ────────────────────────────────────

    get theme(): any {
      return {};
    },
    getAllThemes: () => [],
    getTheme: () => undefined,
    setTheme: () => ({ success: false, error: 'Not supported in Sero' }),

    // ── Tool expansion (no-op) ───────────────────────────

    getToolsExpanded: () => false,
    setToolsExpanded: () => {},
  };
}

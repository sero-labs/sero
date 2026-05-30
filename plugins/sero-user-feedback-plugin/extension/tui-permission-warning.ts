/**
 * TUI renderer for the permission gate warning (Pi CLI interactive mode).
 *
 * Shows a prominent warning box with the dangerous command and
 * Allow/Block options. Uses warning/error colors to make it stand out.
 */

import { Key, matchesKey, truncateToWidth } from '@earendil-works/pi-tui';
import type { ExtensionUIContext } from '@earendil-works/pi-coding-agent';

/**
 * Show a TUI warning prompt for a dangerous command.
 * Returns true if the user allows, false if blocked/cancelled.
 */
export async function showPermissionWarningTUI(
  ui: ExtensionUIContext,
  command: string,
): Promise<boolean> {
  return ui.custom<boolean>((tui, theme, _kb, done) => {
    let selectedIndex = 1; // Default to "Block" (safer default)
    const options = ['Allow', 'Block'] as const;
    let cachedLines: string[] | undefined;

    function refresh() {
      cachedLines = undefined;
      tui.requestRender();
    }

    function handleInput(data: string) {
      if (matchesKey(data, Key.left) || matchesKey(data, Key.up)) {
        selectedIndex = 0;
        refresh();
        return;
      }
      if (matchesKey(data, Key.right) || matchesKey(data, Key.down)) {
        selectedIndex = 1;
        refresh();
        return;
      }
      if (matchesKey(data, Key.enter)) {
        done(selectedIndex === 0);
        return;
      }
      if (matchesKey(data, Key.escape)) {
        done(false);
      }
    }

    function render(width: number): string[] {
      if (cachedLines) return cachedLines;
      const lines: string[] = [];
      const add = (s: string) => lines.push(truncateToWidth(s, width));

      const bar = '━'.repeat(width);
      add(theme.fg('warning', bar));
      lines.push('');
      add(theme.fg('warning', ' ⚠  DANGEROUS COMMAND DETECTED'));
      lines.push('');
      add(theme.fg('warning', ' ─'.repeat(Math.floor((width - 1) / 2))));
      lines.push('');

      // Show the command, wrapped if needed
      const cmdPrefix = '   ';
      const maxCmd = width - cmdPrefix.length - 1;
      const cmdLines = wrapText(command, maxCmd);
      for (const cl of cmdLines) {
        add(cmdPrefix + theme.fg('error', cl));
      }

      lines.push('');
      add(theme.fg('warning', ' ─'.repeat(Math.floor((width - 1) / 2))));
      lines.push('');

      // Options: [ Allow ] [ Block ]
      const allowLabel = selectedIndex === 0
        ? theme.fg('warning', theme.bold('▸ Allow '))
        : theme.fg('dim', '  Allow ');
      const blockLabel = selectedIndex === 1
        ? theme.fg('error', theme.bold('▸ Block '))
        : theme.fg('dim', '  Block ');

      add(`  ${allowLabel}    ${blockLabel}`);
      lines.push('');

      const hint = ' ←→ switch • Enter to confirm • Esc to block';
      add(theme.fg('dim', hint));
      add(theme.fg('warning', bar));

      cachedLines = lines;
      return lines;
    }

    return { render, invalidate: () => { cachedLines = undefined; }, handleInput };
  });
}

/** Simple word-wrap helper. */
function wrapText(text: string, maxWidth: number): string[] {
  if (text.length <= maxWidth) return [text];
  const lines: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxWidth) {
      lines.push(remaining);
      break;
    }
    // Try to break at a space
    let breakAt = remaining.lastIndexOf(' ', maxWidth);
    if (breakAt <= 0) breakAt = maxWidth;
    lines.push(remaining.slice(0, breakAt));
    remaining = remaining.slice(breakAt).trimStart();
  }
  return lines;
}

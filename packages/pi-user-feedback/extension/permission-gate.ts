/**
 * Permission Gate — intercepts dangerous bash commands and requires user approval.
 *
 * Hooks `tool_call` events for the `bash` tool and checks the command against
 * a set of dangerous patterns. When matched:
 *   - Pi CLI mode: shows a warning-styled TUI confirmation via ctx.ui.custom()
 *   - Sero mode:   sends a 'permission' question via the IPC bridge
 *
 * Detection: Sero registers listeners on the user-feedback event bus.
 * If the bus has listeners for 'question-request', we use the IPC bridge.
 * Otherwise we fall back to the TUI prompt.
 *
 * Blocked commands return { block: true, reason: "..." } to the agent.
 */

import type { ExtensionAPI, ExtensionContext } from '@mariozechner/pi-coding-agent';
import { nextQuestionId, askQuestion, hasSeroIPCBridge } from './ipc-bridge';
import { showPermissionWarningTUI } from './tui-permission-warning';

const DANGEROUS_PATTERNS = [
  /\brm\s+(-rf?|--recursive)/i,
  /\bsudo\b/i,
  /\b(chmod|chown)\b.*777/i,
  /\bmkfs\b/i,
  /\bdd\b.*\bof=/i,
  />\s*\/dev\/sd/i,
  /\b(shutdown|reboot|halt|poweroff)\b/i,
];

/** Register the permission gate on the `tool_call` event. */
export function registerPermissionGate(pi: ExtensionAPI) {
  pi.on('tool_call', async (event, ctx) => {
    if (event.toolName !== 'bash') return undefined;

    const command = event.input.command as string;
    const isDangerous = DANGEROUS_PATTERNS.some((p) => p.test(command));
    if (!isDangerous) return undefined;

    if (hasSeroIPCBridge()) {
      return askPermissionViaSero(event.toolCallId, command);
    }

    return askPermissionViaTUI(ctx, command);
  });
}

// ── Sero mode: IPC bridge ────────────────────────────────────

async function askPermissionViaSero(
  toolCallId: string,
  command: string,
): Promise<{ block: true; reason: string } | undefined> {
  const id = nextQuestionId();
  const response = await askQuestion(
    {
      id,
      type: 'permission',
      toolCallId,
      questions: [
        {
          id: 'perm',
          label: 'Permission',
          prompt: `⚠️ Dangerous command detected:\n\n  ${command}\n\nAllow this command to run?`,
          options: [
            { value: 'allow', label: 'Allow' },
            { value: 'block', label: 'Block' },
          ],
          allowOther: false,
        },
      ],
      timestamp: new Date().toISOString(),
    },
  );

  if (response.cancelled || response.answers.length === 0) {
    return { block: true, reason: 'Blocked by user — cancelled' };
  }

  if (response.answers[0].value !== 'allow') {
    return { block: true, reason: 'Blocked by user — dangerous command rejected' };
  }

  return undefined;
}

// ── Pi CLI mode: TUI warning ─────────────────────────────────

async function askPermissionViaTUI(
  ctx: ExtensionContext,
  command: string,
): Promise<{ block: true; reason: string } | undefined> {
  if (!ctx.hasUI) {
    // Non-interactive mode (e.g. print/RPC) — block by default
    return { block: true, reason: 'Dangerous command blocked (no UI for confirmation)' };
  }

  const allowed = await showPermissionWarningTUI(ctx.ui, command);
  if (!allowed) {
    return { block: true, reason: 'Blocked by user — dangerous command rejected' };
  }

  return undefined;
}

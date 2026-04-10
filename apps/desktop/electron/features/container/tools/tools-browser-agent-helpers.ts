import type { AgentToolResult } from '@mariozechner/pi-agent-core';
import { prepareToolImage } from '@electron/shared/media/image-resize';

interface BrowserTextResponse {
  message?: string;
  warning?: string;
  title?: string;
  url?: string;
  text?: string;
  output?: string;
  snapshot?: string;
  result?: unknown;
}

interface RecordingState {
  token: number;
  savePath: string;
  autoStopped: boolean;
  timeout?: ReturnType<typeof setTimeout>;
}

const recordingByWorkspace = new Map<string, RecordingState>();
const AUTOMATION_RECORDING_MAX_MS = 120_000;
const AUTOMATION_RECORDING_MAX_S = AUTOMATION_RECORDING_MAX_MS / 1000;
let nextRecordingToken = 1;

function formatResult(result: unknown): string | undefined {
  if (result === undefined) return undefined;
  if (typeof result === 'string') return result;
  try {
    return JSON.stringify(result, null, 2);
  } catch {
    return String(result);
  }
}

export function formatBrowserText(response: BrowserTextResponse, fallback = 'Done.'): string {
  const parts = [
    response.message,
    response.warning ? `Warning: ${response.warning}` : undefined,
    response.title ? `Automation browser title: ${response.title}` : undefined,
    response.url ? `Automation browser URL: ${response.url}` : undefined,
    response.text,
    response.snapshot,
    formatResult(response.result),
    response.output,
  ].filter(Boolean).map(String);
  return parts.join('\n') || fallback;
}

export function screenshotContent(base64: string, text: string): AgentToolResult<unknown>['content'] {
  const image = prepareToolImage(base64, 'image/png', text);
  return [
    ...(image.text ? [{ type: 'text' as const, text: image.text }] : []),
    { type: 'image' as const, data: image.data, mimeType: image.mimeType },
  ];
}

export function recordingLimitNote(): string {
  return `Safety limit: automation browser recordings auto-stop after ${AUTOMATION_RECORDING_MAX_S}s.`;
}

export function armRecordingAutoStop(workspaceId: string, savePath: string, onAutoStop: () => Promise<void>): void {
  clearRecordingState(workspaceId);
  const token = nextRecordingToken++;
  const state: RecordingState = { token, savePath, autoStopped: false };
  state.timeout = setTimeout(async () => {
    const current = recordingByWorkspace.get(workspaceId);
    if (!current || current.token !== token) return;
    try {
      await onAutoStop();
      const latest = recordingByWorkspace.get(workspaceId);
      if (latest && latest.token === token) {
        latest.autoStopped = true;
        latest.timeout = undefined;
      }
    } catch {
      const latest = recordingByWorkspace.get(workspaceId);
      if (latest && latest.token === token) latest.timeout = undefined;
    }
  }, AUTOMATION_RECORDING_MAX_MS);
  state.timeout.unref?.();
  recordingByWorkspace.set(workspaceId, state);
}

export function finishRecordingState(workspaceId: string): { autoStopped: boolean; savePath: string } | null {
  const state = recordingByWorkspace.get(workspaceId);
  if (!state) return null;
  if (state.timeout) clearTimeout(state.timeout);
  recordingByWorkspace.delete(workspaceId);
  return { autoStopped: state.autoStopped, savePath: state.savePath };
}

export function clearRecordingState(workspaceId: string): void {
  const state = recordingByWorkspace.get(workspaceId);
  if (state?.timeout) clearTimeout(state.timeout);
  recordingByWorkspace.delete(workspaceId);
}

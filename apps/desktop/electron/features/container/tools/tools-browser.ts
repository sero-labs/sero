/**
 * Browser automation tool for agent computer use.
 *
 * Wraps a Python Playwright helper script running inside the container.
 * The agent can launch a headless Chromium browser, navigate web UIs,
 * interact with elements, and take screenshots to verify features visually.
 *
 * Screenshots are returned as image content blocks so the LLM can see
 * what the browser is displaying.
 */

import fs from 'fs';
import path from 'path';

import type { Static } from '@sinclair/typebox';
import type { ToolDefinition, ExtensionContext } from '@mariozechner/pi-coding-agent';
import type { AgentToolResult, AgentToolUpdateCallback } from '@mariozechner/pi-agent-core';
import type { ContainerManager } from '..';
import { BrowserParams, shellEscape } from './tool-schemas';
import { encodeFramesToMp4 } from '../../../shared/media/video-encoder';
import { workspaceManager } from '../../workspace/manager';

const HELPER_CONTAINER_PATH = '/tmp/sero-browser-helper.py';
const HELPER_SOURCE_PATH = path.join(__dirname, 'browser-helper.py');
const BROWSER_SERVER_PORT = 19222;

/** Track which workspaces have had the helper script injected. */
const injectedWorkspaces = new Set<string>();
/** Track which workspaces have a running TCP server. */
const serverWorkspaces = new Set<string>();

/** Per-workspace browser recording state. */
interface BrowserRecordingState {
  active: boolean;
  frames: Array<{ timestamp: number; base64: string }>;
  interval: ReturnType<typeof setInterval> | null;
  fps: number;
}
const browserRecordings = new Map<string, BrowserRecordingState>();

/**
 * Inject the browser helper Python script into the container if not
 * already present. Uses cm.writeFile() which handles base64 encoding.
 */
async function ensureHelperInjected(
  cm: ContainerManager,
  workspaceId: string,
): Promise<void> {
  if (injectedWorkspaces.has(workspaceId)) return;

  const helperSource = fs.readFileSync(HELPER_SOURCE_PATH, 'utf-8');
  await cm.writeFile(workspaceId, HELPER_CONTAINER_PATH, helperSource);
  await cm.exec(workspaceId, `chmod +x '${HELPER_CONTAINER_PATH}'`);
  injectedWorkspaces.add(workspaceId);
}

/**
 * Ensure the persistent TCP browser server is running inside the
 * container.  The server keeps browser state (Playwright browser,
 * context, page) alive across individual tool calls.
 *
 * On first call: injects the helper script and starts the server.
 * On subsequent calls: pings the server; restarts if it died.
 */
async function ensureServerRunning(
  cm: ContainerManager,
  workspaceId: string,
): Promise<void> {
  // Fast path — already tracked and still responding.
  if (serverWorkspaces.has(workspaceId)) {
    const ping = await cm.exec(
      workspaceId,
      `python3 '${HELPER_CONTAINER_PATH}' --ping ${BROWSER_SERVER_PORT}`,
      undefined,
      5_000,
    );
    if (ping.exitCode === 0 && ping.stdout.includes('"ok"')) return;

    // Server died — reset tracking so we re-inject + restart.
    serverWorkspaces.delete(workspaceId);
    injectedWorkspaces.delete(workspaceId);
  }

  await ensureHelperInjected(cm, workspaceId);

  // Kill any stale server process before starting fresh.
  await cm.exec(
    workspaceId,
    `pkill -f 'sero-browser-helper.py --tcp-server' 2>/dev/null || true`,
    undefined,
    5_000,
  );

  // Start the server in the background.
  await cm.exec(
    workspaceId,
    `nohup python3 '${HELPER_CONTAINER_PATH}' --tcp-server ${BROWSER_SERVER_PORT} > /tmp/sero-browser.log 2>&1 &`,
    undefined,
    5_000,
  );

  // Poll until the server is ready (up to 5 s).
  for (let i = 0; i < 10; i++) {
    await new Promise<void>((r) => setTimeout(r, 500));
    const ping = await cm.exec(
      workspaceId,
      `python3 '${HELPER_CONTAINER_PATH}' --ping ${BROWSER_SERVER_PORT}`,
      undefined,
      5_000,
    );
    if (ping.exitCode === 0 && ping.stdout.includes('"ok"')) {
      serverWorkspaces.add(workspaceId);
      return;
    }
  }

  throw new Error(
    'Failed to start browser helper server. Check /tmp/sero-browser.log inside the container.',
  );
}

/** Max base64 screenshot size before we compress to JPEG (500KB). */
const SCREENSHOT_COMPRESS_THRESHOLD = 500 * 1024;

export function createBrowser(
  cm: ContainerManager,
  workspaceId: string,
): ToolDefinition {
  return {
    name: 'browser',
    label: 'browser',
    description:
      'Control a headless Chromium browser inside the container for testing web UIs. ' +
      'Actions: launch (start browser), navigate (go to URL), click (CSS selector or x,y), ' +
      'type (text into element), press_key (keyboard key), screenshot (capture page as image), ' +
      'scroll (up/down), evaluate (run JS), get_text (extract text), wait (for element/timeout), ' +
      'close (shut down browser), start_recording (begin MP4 video capture), ' +
      'stop_recording (stop and save MP4 video). ' +
      'Screenshots are returned as images so you can see the page. ' +
      'Always launch first, then interact, screenshot to verify, and close when done. ' +
      'For verification videos: start_recording, perform actions, stop_recording --save_path /workspace/verify.mp4.',
    parameters: BrowserParams,
    execute: async (
      _toolCallId: string,
      params: Static<typeof BrowserParams>,
      signal: AbortSignal | undefined,
      _onUpdate: AgentToolUpdateCallback | undefined,
      _ctx: ExtensionContext,
    ): Promise<AgentToolResult<unknown>> => {
      if (signal?.aborted) throw new Error('Operation aborted');

      // ── Recording actions (handled on host, not sent to container) ──
      if (params.action === 'start_recording') {
        return handleStartRecording(cm, workspaceId, params.fps ?? 2);
      }
      if (params.action === 'stop_recording') {
        return handleStopRecording(workspaceId, params.save_path);
      }

      // Ensure the persistent browser server is running.
      await ensureServerRunning(cm, workspaceId);

      // Build the JSON command from params
      const command: Record<string, unknown> = { action: params.action };

      // Copy over optional fields that are set
      if (params.url !== undefined) command.url = params.url;
      if (params.selector !== undefined) command.selector = params.selector;
      if (params.x !== undefined) command.x = params.x;
      if (params.y !== undefined) command.y = params.y;
      if (params.text !== undefined) command.text = params.text;
      if (params.clear !== undefined) command.clear = params.clear;
      if (params.key !== undefined) command.key = params.key;
      if (params.expression !== undefined) command.expression = params.expression;
      if (params.direction !== undefined) command.direction = params.direction;
      if (params.amount !== undefined) command.amount = params.amount;
      if (params.full_page !== undefined) command.full_page = params.full_page;
      if (params.timeout !== undefined) command.timeout = params.timeout;
      if (params.wait_until !== undefined) command.wait_until = params.wait_until;
      if (params.viewport !== undefined) command.viewport = params.viewport;

      const jsonCmd = JSON.stringify(command);
      const escapedJson = shellEscape(jsonCmd);

      // Send command to the persistent TCP server via the --send client.
      // The server keeps the browser alive between calls.
      const result = await cm.exec(
        workspaceId,
        `echo '${escapedJson}' | python3 '${HELPER_CONTAINER_PATH}' --send ${BROWSER_SERVER_PORT}`,
        undefined,
        60_000,
      );

      // Parse the JSON response
      const combined = (result.stdout + result.stderr).trim();
      let response: {
        ok: boolean;
        message?: string;
        error?: string;
        screenshot?: string;
        url?: string;
        title?: string;
        result?: unknown;
        text?: string;
        traceback?: string;
      };

      try {
        response = JSON.parse(result.stdout.trim());
      } catch {
        throw new Error(
          `Browser helper returned invalid JSON.\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
        );
      }

      if (!response.ok) {
        const errorMsg = response.error || 'Unknown browser error';
        const trace = response.traceback
          ? `\n\nTraceback:\n${response.traceback}`
          : '';
        throw new Error(`Browser error: ${errorMsg}${trace}`);
      }

      // Build content blocks for the response
      const content: Array<
        | { type: 'text'; text: string }
        | { type: 'image'; data: string; mimeType: string }
      > = [];

      // Handle screenshot responses — return as image content block
      if (response.screenshot) {
        let imageData = response.screenshot;
        let mimeType = 'image/png';

        // Check if screenshot is large and needs compression
        // We do this server-side in the container to avoid sending huge base64 over exec
        const estimatedBytes = Math.floor((imageData.length * 3) / 4);
        if (estimatedBytes > SCREENSHOT_COMPRESS_THRESHOLD) {
          // Re-encode as JPEG in the container for smaller payload
          const jpegResult = await cm.exec(
            workspaceId,
            `python3 -c "
import base64, sys
from PIL import Image
from io import BytesIO
raw = base64.b64decode(sys.stdin.read())
img = Image.open(BytesIO(raw))
out = BytesIO()
img.save(out, format='JPEG', quality=80, optimize=True)
print(base64.b64encode(out.getvalue()).decode(), end='')
" <<< '${shellEscape(imageData)}'`,
            undefined,
            30_000,
          );

          if (jpegResult.exitCode === 0 && jpegResult.stdout.trim()) {
            imageData = jpegResult.stdout.trim();
            mimeType = 'image/jpeg';
          }
          // If JPEG conversion fails, fall back to the original PNG
        }

        content.push({ type: 'image', data: imageData, mimeType });

        // Add text context about the screenshot
        const pageInfo = [
          response.url ? `URL: ${response.url}` : '',
          response.title ? `Title: ${response.title}` : '',
        ]
          .filter(Boolean)
          .join('\n');
        if (pageInfo) {
          content.push({ type: 'text', text: `Screenshot captured.\n${pageInfo}` });
        } else {
          content.push({ type: 'text', text: 'Screenshot captured.' });
        }
      } else {
        // Non-screenshot responses — text only
        const parts: string[] = [];
        if (response.message) parts.push(response.message);
        if (response.url) parts.push(`URL: ${response.url}`);
        if (response.title) parts.push(`Title: ${response.title}`);
        if (response.text !== undefined)
          parts.push(`Text content:\n${response.text}`);
        if (response.result !== undefined)
          parts.push(`Result: ${JSON.stringify(response.result, null, 2)}`);

        content.push({
          type: 'text',
          text: parts.join('\n') || 'Done.',
        });
      }

      return { content, details: undefined };
    },
  };
}

// ── Browser video recording ──────────────────────────────────

type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType: string };

/**
 * Start periodic screenshot capture from the container browser.
 * Frames are stored in memory until stop_recording is called.
 */
async function handleStartRecording(
  cm: ContainerManager,
  workspaceId: string,
  fps: number,
): Promise<AgentToolResult<unknown>> {
  const existing = browserRecordings.get(workspaceId);
  if (existing?.active) {
    return {
      content: [{ type: 'text', text: 'Recording already in progress. Use stop_recording to finish.' }],
      details: undefined,
    };
  }

  await ensureServerRunning(cm, workspaceId);

  const state: BrowserRecordingState = {
    active: true,
    frames: [],
    interval: null,
    fps,
  };

  const intervalMs = Math.round(1000 / fps);
  state.interval = setInterval(async () => {
    if (!state.active) return;
    try {
      const cmd = JSON.stringify({ action: 'screenshot', full_page: false });
      const escaped = shellEscape(cmd);
      const result = await cm.exec(
        workspaceId,
        `echo '${escaped}' | python3 '${HELPER_CONTAINER_PATH}' --send ${BROWSER_SERVER_PORT}`,
        undefined,
        10_000,
      );
      const response = JSON.parse(result.stdout.trim());
      if (response.ok && response.screenshot) {
        state.frames.push({ timestamp: Date.now(), base64: response.screenshot });
      }
    } catch {
      // Skip frame on error
    }
  }, intervalMs);

  browserRecordings.set(workspaceId, state);

  return {
    content: [{ type: 'text', text: `Browser recording started at ${fps} FPS. Perform actions, then use stop_recording to save.` }],
    details: undefined,
  };
}

/**
 * Stop recording and encode captured frames to MP4.
 * Defaults to saving in <workspace>/sero-recordings/ if no save_path is specified.
 */
async function handleStopRecording(
  workspaceId: string,
  savePath?: string,
): Promise<AgentToolResult<unknown>> {
  const state = browserRecordings.get(workspaceId);
  if (!state?.active) {
    return {
      content: [{ type: 'text', text: 'No active recording. Use start_recording first.' }],
      details: undefined,
    };
  }

  state.active = false;
  if (state.interval) {
    clearInterval(state.interval);
    state.interval = null;
  }
  browserRecordings.delete(workspaceId);

  if (state.frames.length === 0) {
    return {
      content: [{ type: 'text', text: 'Recording stopped but no frames were captured.' }],
      details: undefined,
    };
  }

  // Default to <workspace>/sero-recordings/ on the host
  let outputPath = savePath;
  if (!outputPath) {
    const wsPath = workspaceManager.getPath(workspaceId);
    if (wsPath) {
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      outputPath = path.join(wsPath, 'sero-recordings', `browser-recording-${ts}.mp4`);
    }
  }

  try {
    const result = await encodeFramesToMp4({
      frames: state.frames,
      fps: state.fps,
      outputPath,
    });

    const durSec = Math.round(result.durationMs / 1000);
    const format = result.isVideo ? 'MP4' : 'PNG frames (ffmpeg not available)';
    const content: ContentBlock[] = [{
      type: 'text',
      text: `Recording saved: ${result.path}\nFormat: ${format}\nFrames: ${result.frameCount}, Duration: ${durSec}s`,
    }];

    return { content, details: undefined };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Encoding failed';
    return {
      content: [{ type: 'text', text: `Recording stopped but encoding failed: ${msg}` }],
      details: undefined,
    };
  }
}

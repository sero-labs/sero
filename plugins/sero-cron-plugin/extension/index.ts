/**
 * Cron Extension — Pi extension for managing scheduled cron jobs and reminders.
 *
 * Global-scoped: state at ~/.sero-ui/apps/cron/state.json (Sero)
 * or .sero/apps/cron/state.json relative to cwd (Pi CLI fallback).
 *
 * Tools: current_time, cron, reminder
 * Commands: /cron
 *
 * IMPORTANT: The scheduler is a MODULE-LEVEL singleton. The default export
 * may be called multiple times (once per Sero session), but only one
 * scheduler exists per process. This prevents double job execution.
 */

import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

import { createCronRuntime } from './runtime';
import {
  registerCronCommand,
  registerCronTool,
  registerCurrentTimeTool,
  registerReminderTool,
} from './tools';

const runtime = createCronRuntime();

export default function (pi: ExtensionAPI) {
  console.log('[cron] extension loaded');

  runtime.attachPi(pi);

  pi.on('session_start', async (_event, ctx) => {
    await runtime.handleSessionStart(pi, { cwd: ctx.cwd });
  });

  pi.on('session_shutdown', async () => {
    await runtime.handleSessionShutdown();
  });

  registerCronCommand(pi, runtime);
  registerCurrentTimeTool(pi);
  registerCronTool(pi, runtime);
  registerReminderTool(pi, runtime);
}

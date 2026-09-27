/**
 * Cron Extension — Pi extension for managing scheduled cron jobs and reminders.
 *
 * Global-scoped: state at ~/.sero-ui/apps/cron/state.json (Sero)
 * or .sero/apps/cron/state.json relative to cwd (Pi CLI fallback).
 *
 * Tools: current_time, cron, reminder
 * Commands: /cron
 *
 * IMPORTANT: The scheduler is a PROCESS-WIDE singleton. The default export
 * is called once per Sero session, and Pi evaluates this module again after a
 * resource reload or when a session opens in another folder. The runtime lives
 * on `globalThis`, so every module copy shares one scheduler. This prevents
 * double job execution.
 */

import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

import { createCronRuntime } from './runtime';
import {
  registerCronCommand,
  registerCronTool,
  registerCurrentTimeTool,
  registerReminderTool,
} from './tools';

const RUNTIME_KEY = Symbol.for('@sero-ai/plugin-cron/runtime');
type CronGlobal = typeof globalThis & { [RUNTIME_KEY]?: ReturnType<typeof createCronRuntime> };
const runtime = (globalThis as CronGlobal)[RUNTIME_KEY] ??= createCronRuntime();

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

/**
 * `mcp_manager` steps for MCP Tasks. Two tasks run on the HTTP fixture, the
 * only mode that serves Tasks: `hold` never ends and is cancelled, `complete`
 * ends on its own and is read, then dismissed. The effects are read from the
 * plugin's `tasks.json`.
 */
import { expectText } from '../expect';
import type { ScenarioStep, StepContext } from '../types';
import {
  appFile,
  detailsOf,
  ensureHttpServer,
  expectMatch,
  HTTP_SERVER,
  readJson,
  startReportTask,
  waitForTaskEnd,
} from './mcp-support';

interface TaskRow { taskId: string; status: string; resultText: string | null }
interface TasksFile { tasks: TaskRow[] }

const heldId = (ctx: StepContext) => String(ctx.state.heldTask);
const doneId = (ctx: StepContext) => String(ctx.state.doneTask);

function tasksOnDisk(ctx: StepContext): TaskRow[] {
  return readJson<TasksFile>(appFile(ctx, 'tasks.json')).tasks;
}

function listedTasks(details: Record<string, unknown>): TaskRow[] {
  return details.tasks as TaskRow[];
}

export const taskSteps: ScenarioStep[] = [
  {
    action: 'list_tasks',
    setup: async (ctx) => {
      await ensureHttpServer(ctx);
      ctx.state.heldTask = await startReportTask(ctx, 'held', 'hold');
      ctx.state.doneTask = await startReportTask(ctx, 'done', 'complete');
      await waitForTaskEnd(ctx, doneId(ctx));
    },
    params: { action: 'list_tasks' },
    expect(result, ctx) {
      expectMatch(result, /^\d+ MCP task\(s\)\.$/);
      const listed = listedTasks(detailsOf(result));
      const held = listed.find((task) => task.taskId === heldId(ctx));
      const done = listed.find((task) => task.taskId === doneId(ctx));
      if (held?.status !== 'working') throw new Error(`the held task is ${held?.status}`);
      if (done?.status !== 'completed') throw new Error(`the finished task is ${done?.status}`);
    },
  },
  {
    action: 'task_result',
    params: (ctx) => ({ action: 'task_result', taskId: doneId(ctx) }),
    expect(result, ctx) {
      expectText(result, `MCP task ${doneId(ctx)} (${HTTP_SERVER} · run_report): completed.`);
      // The report text is the fixture server's own reply.
      expectText(result, 'report ready: done');
    },
  },
  {
    action: 'cancel_task',
    params: (ctx) => ({ action: 'cancel_task', taskId: heldId(ctx) }),
    expect(result, ctx) {
      expectText(result, `MCP task ${heldId(ctx)} (${HTTP_SERVER} · run_report): cancelled.`);
      const row = tasksOnDisk(ctx).find((task) => task.taskId === heldId(ctx));
      if (row?.status !== 'cancelled') throw new Error(`tasks.json shows the held task as ${row?.status}`);
    },
  },
  {
    action: 'dismiss_task',
    params: (ctx) => ({ action: 'dismiss_task', taskId: doneId(ctx) }),
    expect(result, ctx) {
      expectText(result, `Dismissed MCP task ${doneId(ctx)}.`);
      if (tasksOnDisk(ctx).some((task) => task.taskId === doneId(ctx))) throw new Error('the dismissed task is still in tasks.json');
    },
  },
  {
    // A second listing shows both changes: the dismissed task is gone, the cancelled one stays.
    action: 'list_tasks',
    params: { action: 'list_tasks' },
    expect(result, ctx) {
      const listed = listedTasks(detailsOf(result));
      if (listed.some((task) => task.taskId === doneId(ctx))) throw new Error('the dismissed task is still listed');
      const held = listed.find((task) => task.taskId === heldId(ctx));
      if (held?.status !== 'cancelled') throw new Error(`the cancelled task is listed as ${held?.status}`);
    },
  },
];

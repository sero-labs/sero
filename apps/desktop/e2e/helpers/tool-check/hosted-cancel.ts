/**
 * Cancellation at a hosted site. The session runs a long `bash` command, and
 * the test process stops it the way the user would: an "intervene now" note to
 * a Room member, or stop then resume for a project's owner. The driver reads
 * the cancelled call's result from the session's next request, so a pass also
 * shows that the session took its next prompt.
 */
import type { ToolCheckApp } from './app';
import { Heartbeat, nextCancel, within } from './cancel';
import type { RunStep } from './driver';
import { CANCELS } from './ledger';
import { onlyRoomId } from './probes/room';
import { REVIEWER } from './probes/rooms-stub';
import type { StepContext } from './types';

/** How the user stops a hosted session's turn. */
export type Stop = (ctx: StepContext) => Promise<void>;

export function cancelStep(stop: Stop): RunStep {
  const n = nextCancel();
  let beat: Heartbeat | undefined;
  let stopping: Promise<void> = Promise.resolve();
  return {
    tool: 'bash',
    via: 'direct',
    action: CANCELS,
    setup: async (ctx) => {
      beat = new Heartbeat(n, ctx.workspacePath);
      // Beside the call: once the command is running, the user stops it.
      stopping = beat.started().then(() => stop(ctx));
      stopping.catch(() => undefined);
    },
    params: () => ({ command: beat!.command }),
    async expect() {
      await within(stopping, 60_000, 'the stop did not finish');
      await beat!.stopped();
    },
  };
}

async function invoke(check: ToolCheckApp, appId: string, tool: string, params: Record<string, unknown>): Promise<string> {
  const result = await check.page.evaluate(
    ({ app, id, name, args }) => window.sero.appAgent.invokeTool(app, id, name, args),
    { app: appId, id: check.workspaceId, name: tool, args: params },
  );
  if (result.isError) throw new Error(`${tool} ${String(params.action)} failed: ${result.text}`);
  return result.text;
}

/** The user interrupts the reviewer with a note, delivered now. */
export function interruptReviewer(check: ToolCheckApp): Stop {
  return async (ctx) => {
    const roomId = await onlyRoomId({ ...ctx, workspacePath: check.workspaceDir });
    await invoke(check, 'orchestrator', 'rooms', { action: 'intervene', roomId, memberIds: REVIEWER, body: 'tc-cancel: stop that', deliver: 'now' });
  };
}

/** The user stops the project, which ends the owner's turn, and resumes it, which starts the next. */
export function stopAndResumeOwner(check: ToolCheckApp): Stop {
  return async (ctx) => {
    const projectId = String(ctx.state.projectId);
    await invoke(check, 'architect', 'architect_projects', { action: 'stop', projectId });
    await invoke(check, 'architect', 'architect_projects', { action: 'resume', projectId });
  };
}

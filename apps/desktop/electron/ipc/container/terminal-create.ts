import type { TerminalCreateResult } from '@/types/ipc';
import { createWorkspaceRuntimeFacade } from '@electron/features/workspace/runtime/runtime-facade';
import type { WorkspaceRuntimeFacade } from '@electron/features/workspace/runtime/types';

export interface CreateTerminalSessionInput {
  workspaceId: string;
  terminalId: string;
  cols?: number;
  rows?: number;
  onData(data: string): void;
  createRuntimeFacade?: (workspaceId: string) => Promise<WorkspaceRuntimeFacade>;
}

export async function createTerminalSession(
  input: CreateTerminalSessionInput,
): Promise<TerminalCreateResult> {
  const createRuntimeFacade = input.createRuntimeFacade ?? createWorkspaceRuntimeFacade;
  const runtime = await createRuntimeFacade(input.workspaceId);
  const session = await runtime.createTerminal({
    terminalId: input.terminalId,
    cols: input.cols,
    rows: input.rows,
  });

  session.pty.onData((data: string) => {
    input.onData(data);
  });

  return {
    runtime: session.runtime,
    fallbackReason: session.fallbackReason ?? runtime.fallbackReason,
  };
}

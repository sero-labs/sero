import type { SubagentManager } from '../subagent';
import { ROLE_AGENT_NAMES } from './agents';
import type { CollaborationResult, CollaborationRole } from '@/types/collaboration';

export type CollaborationRunner = Pick<SubagentManager, 'runSingleStructured'>;
export type SpecialistOutput = CollaborationResult['specialistOutputs'][number];

type SpecialistModel = Parameters<CollaborationRunner['runSingleStructured']>[0]['model'];

export interface RunSingleSpecialistParams {
  role: CollaborationRole;
  task: string;
  parentSessionId: string;
  workspaceId: string;
  manager: CollaborationRunner;
  model?: SpecialistModel;
  onUpdate?: (text: string) => void;
  onStart?: (role: CollaborationRole, agentName: string) => void;
  onSuccess?: (output: SpecialistOutput) => void;
  onError?: (params: {
    role: CollaborationRole;
    agentName: string;
    error: unknown;
    durationMs: number;
  }) => SpecialistOutput;
}

/**
 * Shared single-specialist execution helper used by both collaboration strategies.
 */
export async function runSingleSpecialist(params: RunSingleSpecialistParams): Promise<SpecialistOutput> {
  const agentName = ROLE_AGENT_NAMES[params.role];
  const startedAt = Date.now();

  params.onStart?.(params.role, agentName);

  try {
    const result = await params.manager.runSingleStructured({
      agent: agentName,
      task: params.task,
      parentSessionId: params.parentSessionId,
      workspaceId: params.workspaceId,
      model: params.model,
      onUpdate: params.onUpdate,
    });

    const output: SpecialistOutput = {
      role: params.role,
      agentName,
      response: result.response,
      error: result.error,
      durationMs: Date.now() - startedAt,
    };

    params.onSuccess?.(output);
    return output;
  } catch (error: unknown) {
    const durationMs = Date.now() - startedAt;
    if (!params.onError) {
      throw error;
    }

    return params.onError({
      role: params.role,
      agentName,
      error,
      durationMs,
    });
  }
}

export function getSpecialistErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

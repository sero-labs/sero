/**
 * Model operations for the gateway.
 *
 * The phone changes the same session model state the desktop shows, so
 * this reuses the desktop's own builder and validators. A second copy of
 * the rules would drift, and the phone would then accept a model the
 * desktop refuses.
 */

import type { AgentSession } from '@earendil-works/pi-coding-agent';
import type { GatewaySessionModelState } from '@electron/features/gateway/server/types';
import {
  buildModelState,
  validateProvider,
  validateThinkingLevel,
} from '../agent/core/agent-helpers';

/** Flatten the desktop's model state for the wire. */
export function toGatewayModelState(session: AgentSession): GatewaySessionModelState {
  const state = buildModelState({ session });
  return {
    provider: state.model.provider,
    modelId: state.model.modelId,
    name: state.model.name,
    reasoning: state.model.reasoning,
    thinkingLevel: state.thinkingLevel,
    availableThinkingLevels: state.availableThinkingLevels,
    availableModels: state.availableModels,
  };
}

/**
 * Switch a session's model.
 *
 * The same two checks the desktop makes: the model must exist in the
 * registry, and it must have credentials. Without the second check a
 * phone could pick a model that then fails on the next prompt.
 */
export async function applySessionModel(
  session: AgentSession,
  provider: string,
  modelId: string,
): Promise<void> {
  const validatedProvider = validateProvider(provider);

  const model = session.modelRuntime.getModel(validatedProvider, modelId);
  if (!model) {
    throw new Error(`Model not found: ${provider}/${modelId}`);
  }

  const available = await session.modelRuntime.getAvailable();
  const hasAuth = available.some(
    (candidate) => candidate.provider === validatedProvider && candidate.id === modelId,
  );
  if (!hasAuth) {
    throw new Error(`No credentials for ${provider}/${modelId}`);
  }

  await session.setModel(model);
}

/** Set a session's thinking level. An unknown level is refused. */
export function applySessionThinkingLevel(session: AgentSession, level: string): void {
  session.setThinkingLevel(validateThinkingLevel(level));
}

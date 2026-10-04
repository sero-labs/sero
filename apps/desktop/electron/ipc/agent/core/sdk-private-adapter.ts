import type { AgentSession } from '@earendil-works/pi-coding-agent';
import type { Api, Model } from '@earendil-works/pi-ai';

// Validated against pi-coding-agent@1.0.2, where `agent.state.model` is a plain writable field.
interface MutableRuntimeStateAccessor {
  agent: Omit<AgentSession['agent'], 'state'> & {
    state: Omit<AgentSession['agent']['state'], 'model'> & {
      model: Model<Api> | undefined;
    };
  };
}

function asMutableRuntimeState(session: AgentSession): MutableRuntimeStateAccessor {
  return session as unknown as MutableRuntimeStateAccessor;
}

/** Swap the live runtime model object without appending session history. */
export function setRuntimeSessionModel(
  session: AgentSession,
  model: Model<Api> | undefined,
): void {
  const state = asMutableRuntimeState(session).agent.state;
  state.model = model;
}

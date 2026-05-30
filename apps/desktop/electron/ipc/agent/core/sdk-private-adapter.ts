import type { AgentSession } from '@earendil-works/pi-coding-agent';
import type { Api, Model } from '@earendil-works/pi-ai';

const VALIDATED_PI_CODING_AGENT_VERSION = '0.78.0';

interface SessionPrivatePromptAccessor {
  _baseSystemPrompt?: string;
}

interface SessionManagerPrivateRewriteAccessor {
  _rewriteFile?: () => void;
}

interface MutableRuntimeStateAccessor {
  agent: Omit<AgentSession['agent'], 'state'> & {
    state: Omit<AgentSession['agent']['state'], 'model' | 'systemPrompt'> & {
      model: Model<Api> | undefined;
      systemPrompt: string;
    };
  };
}

function warnVersionMismatch(message: string): void {
  console.warn(
    `${message} SDK version mismatch? Tested against pi-coding-agent@${VALIDATED_PI_CODING_AGENT_VERSION}.`,
  );
}

function asSessionWithPrivatePrompt(session: AgentSession): SessionPrivatePromptAccessor {
  return session as unknown as SessionPrivatePromptAccessor;
}

function asSessionManagerWithRewrite(session: AgentSession): SessionManagerPrivateRewriteAccessor {
  return session.sessionManager as unknown as SessionManagerPrivateRewriteAccessor;
}

function asMutableRuntimeState(session: AgentSession): MutableRuntimeStateAccessor {
  return session as unknown as MutableRuntimeStateAccessor;
}

/** Safely read _baseSystemPrompt from AgentSession (private SDK field). */
export function getBaseSystemPrompt(session: AgentSession): string | undefined {
  const privateSession = asSessionWithPrivatePrompt(session);
  if (typeof privateSession._baseSystemPrompt !== 'string') {
    warnVersionMismatch('[context-editor] _baseSystemPrompt not found on AgentSession — ');
    return undefined;
  }
  return privateSession._baseSystemPrompt;
}

/** Safely write _baseSystemPrompt + update the agent's current prompt. */
export function setBaseSystemPrompt(session: AgentSession, prompt: string): void {
  const privateSession = asSessionWithPrivatePrompt(session);
  if (typeof privateSession._baseSystemPrompt !== 'string') {
    warnVersionMismatch('[context-editor] _baseSystemPrompt not found on AgentSession — ');
  }
  privateSession._baseSystemPrompt = prompt;
  asMutableRuntimeState(session).agent.state.systemPrompt = prompt;
}

/** Persist session-manager custom-entry mutations via the SDK's private rewrite hook. */
export function rewriteSessionManagerFile(session: AgentSession): void {
  const maybeRewriteFile = asSessionManagerWithRewrite(session)._rewriteFile;
  if (typeof maybeRewriteFile === 'function') {
    maybeRewriteFile.call(session.sessionManager);
    return;
  }

  warnVersionMismatch('[context-editor] SessionManager._rewriteFile not found — ');
}

/** Swap the live runtime model object without appending session history. */
export function setRuntimeSessionModel(
  session: AgentSession,
  model: Model<Api> | undefined,
): void {
  const state = asMutableRuntimeState(session).agent.state;
  state.model = model;
}

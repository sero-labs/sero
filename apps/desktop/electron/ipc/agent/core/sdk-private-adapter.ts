import type { AgentSession } from '@mariozechner/pi-coding-agent';
import type { Api, Model } from '@mariozechner/pi-ai';

interface SessionPrivatePromptAccessor {
  _baseSystemPrompt?: string;
}

interface SessionManagerPrivateRewriteAccessor {
  _rewriteFile?: () => void;
}

type SessionWithMutableRuntimeModel = AgentSession & {
  agent: AgentSession['agent'] & {
    setModel(model: Model<Api> | undefined): void;
  };
};

function asSessionWithPrivatePrompt(session: AgentSession): SessionPrivatePromptAccessor {
  return session as unknown as SessionPrivatePromptAccessor;
}

function asSessionManagerWithRewrite(session: AgentSession): SessionManagerPrivateRewriteAccessor {
  return session.sessionManager as unknown as SessionManagerPrivateRewriteAccessor;
}

function asRuntimeMutableSession(session: AgentSession): SessionWithMutableRuntimeModel {
  return session as unknown as SessionWithMutableRuntimeModel;
}

/** Safely read _baseSystemPrompt from AgentSession (private SDK field). */
export function getBaseSystemPrompt(session: AgentSession): string | undefined {
  const privateSession = asSessionWithPrivatePrompt(session);
  if (typeof privateSession._baseSystemPrompt !== 'string') {
    console.warn(
      '[context-editor] _baseSystemPrompt not found on AgentSession — ' +
        'SDK version mismatch? Tested against pi-coding-agent@0.52.12.',
    );
    return undefined;
  }
  return privateSession._baseSystemPrompt;
}

/** Safely write _baseSystemPrompt + update the agent's current prompt. */
export function setBaseSystemPrompt(session: AgentSession, prompt: string): void {
  const privateSession = asSessionWithPrivatePrompt(session);
  if (typeof privateSession._baseSystemPrompt !== 'string') {
    console.warn(
      '[context-editor] _baseSystemPrompt not found on AgentSession — ' +
        'SDK version mismatch? Tested against pi-coding-agent@0.52.12.',
    );
  }
  privateSession._baseSystemPrompt = prompt;
  session.agent.setSystemPrompt(prompt);
}

/** Persist session-manager custom-entry mutations via the SDK's private rewrite hook. */
export function rewriteSessionManagerFile(session: AgentSession): void {
  const maybeRewriteFile = asSessionManagerWithRewrite(session)._rewriteFile;
  if (typeof maybeRewriteFile === 'function') {
    maybeRewriteFile.call(session.sessionManager);
  }
}

/** Swap the live runtime model object without appending session history. */
export function setRuntimeSessionModel(
  session: AgentSession,
  model: Model<Api> | undefined,
): void {
  asRuntimeMutableSession(session).agent.setModel(model);
}

import type { AgentSession } from '@mariozechner/pi-coding-agent';
import { createAgentSession, SessionManager } from '@mariozechner/pi-coding-agent';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getBaseSystemPrompt,
  rewriteSessionManagerFile,
  setBaseSystemPrompt,
  setRuntimeSessionModel,
} from '@electron/ipc/agent/core/sdk-private-adapter';

interface FakeSession {
  _baseSystemPrompt?: string;
  agent: {
    state: {
      systemPrompt?: string;
      model?: unknown;
    };
  };
  sessionManager: {
    _rewriteFile?: () => void;
  };
}

function toAgentSession(session: FakeSession): AgentSession {
  return session as unknown as AgentSession;
}

describe('agent SDK private adapter', () => {
  const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

  beforeEach(() => {
    consoleWarn.mockClear();
  });

  it('reads and writes the cached base system prompt while updating the live agent prompt', () => {
    const session = {
      _baseSystemPrompt: 'Original prompt',
      agent: { state: { systemPrompt: 'Original prompt' } },
      sessionManager: {},
    } as FakeSession;

    expect(getBaseSystemPrompt(toAgentSession(session))).toBe('Original prompt');

    setBaseSystemPrompt(toAgentSession(session), 'Updated prompt');

    expect(getBaseSystemPrompt(toAgentSession(session))).toBe('Updated prompt');
    expect(session.agent.state.systemPrompt).toBe('Updated prompt');
    expect(consoleWarn).not.toHaveBeenCalled();
  });

  it('warns with the validated Pi version when the prompt cache shape changes', () => {
    const session = {
      agent: { state: { systemPrompt: 'Original prompt' } },
      sessionManager: {},
    } as FakeSession;

    expect(getBaseSystemPrompt(toAgentSession(session))).toBeUndefined();
    setBaseSystemPrompt(toAgentSession(session), 'Updated prompt');

    expect(session.agent.state.systemPrompt).toBe('Updated prompt');
    expect(consoleWarn).toHaveBeenCalledWith(
      expect.stringContaining('pi-coding-agent@0.72.1'),
    );
  });

  it('invokes the private session-manager rewrite hook when present', () => {
    const rewriteFile = vi.fn();
    const session = {
      agent: { state: { systemPrompt: '' } },
      sessionManager: { _rewriteFile: rewriteFile },
    } as FakeSession;

    rewriteSessionManagerFile(toAgentSession(session));

    expect(rewriteFile).toHaveBeenCalledTimes(1);
  });

  it('warns with the validated Pi version when the rewrite hook is unavailable', () => {
    const session = {
      agent: { state: { systemPrompt: '' } },
      sessionManager: {},
    } as FakeSession;

    rewriteSessionManagerFile(toAgentSession(session));

    expect(consoleWarn).toHaveBeenCalledWith(
      expect.stringContaining('pi-coding-agent@0.72.1'),
    );
  });

  it('matches private prompt/rewrite shapes on the Pi 0.72.1 AgentSession runtime', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'sero-pi-adapter-'));
    try {
      const { session } = await createAgentSession({
        cwd: tempDir,
        agentDir: tempDir,
        noTools: 'all',
        sessionManager: SessionManager.inMemory(tempDir),
      });

      expect(getBaseSystemPrompt(session)).toEqual(expect.any(String));

      setBaseSystemPrompt(session, 'Runtime prompt');
      expect(session.systemPrompt).toBe('Runtime prompt');

      rewriteSessionManagerFile(session);
      expect(consoleWarn).not.toHaveBeenCalled();
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('updates the runtime model object through the narrow private adapter', () => {
    const session = {
      agent: { state: { model: { provider: 'openai', id: 'old-model' } } },
      sessionManager: {},
    } as FakeSession;
    const model = { provider: 'openai', id: 'gpt-5.4' } as never;

    setRuntimeSessionModel(toAgentSession(session), model);
    expect(session.agent.state.model).toBe(model);

    setRuntimeSessionModel(toAgentSession(session), undefined);
    expect(session.agent.state.model).toBeUndefined();
  });
});

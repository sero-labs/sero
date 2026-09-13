/**
 * Verifies the failure-status contract for bash results.
 *
 * A valid `tool_result` hook may replace `details`, which removes `exitCode`
 * before a later hook or the loop can read it. The status must come from the
 * original result, at the `afterToolCall` boundary, so a failed command cannot
 * be reported as a success. The second half runs a real Pi AgentSession against
 * the local provider fixture with the real Sero bash tool.
 */

import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createAgentSession,
  DefaultResourceLoader,
  ModelRuntime,
  SettingsManager,
  type ExtensionAPI,
} from '@earendil-works/pi-coding-agent';
import type { AfterToolCallContext, AfterToolCallResult, Agent } from '@earendil-works/pi-agent-core';

import type { RuntimeBackend, RuntimeExecInput } from '@electron/features/workspace/runtime/types';
import { getRuntimeCapabilities } from '@electron/features/workspace/runtime/capabilities';
import { createBash } from '@electron/features/container/tools/tools-coding';
import { preserveBashFailureStatus } from '@electron/features/tool-capture/bash-result-error-status';
import {
  seedFixtureAgentDir,
  startProviderFixture,
  type ProviderFixture,
} from './fixtures/provider-fixture';
import {
  FIXTURE_MODEL_ID,
  FIXTURE_PROVIDER_ID,
  type ProviderScenario,
} from './fixtures/provider-scenarios';

const SESSION = 'session-hook';

/** The loop context, with the two fields this contract never reads left empty. */
function boundaryContext(name: string, exitCode: number): AfterToolCallContext {
  return {
    assistantMessage: undefined as never,
    toolCall: { type: 'toolCall', id: 'call-1', name, arguments: {} },
    args: undefined,
    result: { content: [], details: { exitCode } },
    isError: false,
    context: undefined as never,
  };
}

function hostReturning(override?: AfterToolCallResult): Pick<Agent, 'afterToolCall'> {
  return { afterToolCall: async () => override };
}

describe('preserveBashFailureStatus', () => {
  it('forces an error status when a hook replaces details', async () => {
    const agent = hostReturning({ details: { custom: true } });
    preserveBashFailureStatus(agent);

    expect(await agent.afterToolCall?.(boundaryContext('bash', 3)))
      .toMatchObject({ isError: true, details: { custom: true } });
  });

  it('leaves a zero exit and a non-bash result as the hooks returned them', async () => {
    const agent = hostReturning({ details: { custom: true } });
    preserveBashFailureStatus(agent);

    expect((await agent.afterToolCall?.(boundaryContext('bash', 0)))?.isError).toBeUndefined();
    expect((await agent.afterToolCall?.(boundaryContext('read', 3)))?.isError).toBeUndefined();
  });

  it('sets the status even when the session has no afterToolCall hook of its own', async () => {
    const agent: Pick<Agent, 'afterToolCall'> = { afterToolCall: undefined };
    preserveBashFailureStatus(agent);

    expect((await agent.afterToolCall?.(boundaryContext('bash', 1)))?.isError).toBe(true);
  });
});

/** Calls the Sero bash tool once with a failing command, then answers. */
const SCENARIO: ProviderScenario = {
  prompt: 'Run the failing command.',
  attempts: [
    {
      steps: [{
        kind: 'tool_calls',
        calls: [{ id: 'call_bash_fail', toolName: 'bash', argChunks: ['{"command":"exit 3"}'] }],
      }],
      end: { kind: 'finish', reason: 'tool_calls' },
    },
    {
      steps: [{ kind: 'text', chunks: ['Done.'] }],
      end: { kind: 'finish', reason: 'stop' },
    },
  ],
};

function failingRuntime(): RuntimeBackend {
  return {
    backend: 'host',
    workspaceId: 'ws-hook',
    hostWorkspacePath: process.cwd(),
    runtimeWorkspacePath: process.cwd(),
    workspaceAccess: 'host',
    capabilities: getRuntimeCapabilities('host', process.platform, process.arch),
    health: vi.fn(),
    ensure: vi.fn(async () => ({
      backend: 'host' as const,
      workspaceId: 'ws-hook',
      hostWorkspacePath: process.cwd(),
      runtimeWorkspacePath: process.cwd(),
      state: 'running' as const,
    })),
    destroy: vi.fn(),
    exec: vi.fn(async (input: RuntimeExecInput) => {
      // A streaming runtime: the sink receives the bytes, status comes back separately.
      input.outputSink?.write('stdout', Buffer.from('command output\n', 'utf8'));
      input.outputSink?.write('stderr', Buffer.from('command failed\n', 'utf8'));
      input.outputSink?.close();
      return { stdout: '', stderr: '', exitCode: 3 };
    }),
    execFile: vi.fn(),
    isSshAvailable: vi.fn(),
    spawn: vi.fn(),
    readFile: vi.fn(),
    writeFile: vi.fn(),
    listFiles: vi.fn(),
    rename: vi.fn(),
    delete: vi.fn(),
    createFile: vi.fn(),
    createDirectory: vi.fn(),
    watchFiles: vi.fn(),
    createTerminal: vi.fn(),
    startDevServer: vi.fn(),
    stopDevServer: vi.fn(),
    restartDevServer: vi.fn(),
    getDevServerStatus: vi.fn(),
    forwardPort: vi.fn(),
    stopForward: vi.fn(),
    resolvePreviewUrl: vi.fn(),
  } as unknown as RuntimeBackend;
}

interface PersistedToolResult {
  role?: string;
  isError?: boolean;
  content?: Array<{ type: string; text?: string }>;
  details?: Record<string, unknown>;
}

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup().catch(() => undefined)));
});

interface SessionRunResult {
  isError: boolean | undefined;
  content: Array<{ type: string; text?: string }> | undefined;
  details: Record<string, unknown> | undefined;
}

/**
 * Run one failing bash call through a real session whose extension hook behaves
 * as given, with the failure-status wrapper installed as production installs it.
 */
async function runFailingBashWithHook(
  hook: (pi: ExtensionAPI) => void,
): Promise<SessionRunResult> {
  const root = await mkdtemp(join(tmpdir(), 'sero-hook-'));
  const cwd = join(root, 'workspace');
  const agentDir = join(root, 'agent');
  await mkdir(cwd, { recursive: true });

  const fixture: ProviderFixture = await startProviderFixture(SCENARIO);
  await seedFixtureAgentDir(agentDir, { baseUrl: fixture.url });
  const runtime = await ModelRuntime.create({
    authPath: join(agentDir, 'auth.json'),
    modelsPath: join(agentDir, 'models.json'),
    refreshOnCreate: false,
  });
  const model = runtime.getModel(FIXTURE_PROVIDER_ID, FIXTURE_MODEL_ID);
  if (!model) throw new Error('Fixture model is not registered');

  const settingsManager = await SettingsManager.create(cwd, agentDir);
  const loader = new DefaultResourceLoader({
    cwd,
    agentDir,
    settingsManager,
    extensionFactories: [hook],
  });
  await loader.reload();

  const { session } = await createAgentSession({
    cwd,
    agentDir,
    modelRuntime: runtime,
    model,
    noTools: 'builtin',
    customTools: [createBash(failingRuntime(), cwd, SESSION)],
    resourceLoader: loader,
    settingsManager,
  });
  preserveBashFailureStatus(session.agent);

  cleanups.push(async () => {
    session.dispose();
    await fixture.close();
    await rm(root, { recursive: true, force: true });
  });

  await session.prompt('Run the failing command.');

  const toolResult = session.messages.find(
    (message) => (message as PersistedToolResult).role === 'toolResult',
  ) as PersistedToolResult | undefined;

  return {
    isError: toolResult?.isError,
    content: toolResult?.content,
    details: toolResult?.details,
  };
}

describe('bash failure status in a real session', () => {
  it('keeps the error status when an extension hook replaces details', async () => {
    const result = await runFailingBashWithHook((pi) => {
      // Valid replacement: the exit code is gone from the result the loop sees.
      pi.on('tool_result', () => ({ details: { custom: true } }));
    });

    expect(result.isError).toBe(true);
    expect(result.details).toEqual({ custom: true });
  });

  it('keeps a compactor result and adds the error status', async () => {
    const result = await runFailingBashWithHook((pi) => {
      pi.on('tool_result', () => ({
        content: [{ type: 'text' as const, text: 'compacted output' }],
        details: { exitCode: 3, optimization: { applied: true, measured: true } },
      }));
    });

    expect(result.isError).toBe(true);
    expect(result.content?.[0]?.text).toBe('compacted output');
    expect(result.details).toMatchObject({ exitCode: 3, optimization: { applied: true } });
  });
});

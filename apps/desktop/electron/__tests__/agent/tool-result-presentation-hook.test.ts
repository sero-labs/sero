/**
 * Verifies the integration contract that complete-output metadata relies on:
 * a tool that rejects still produces a `tool_result` extension event, and the
 * hook's returned content and details replace the rejection's own.
 *
 * This runs a real Pi AgentSession against the local provider fixture, with the
 * real Sero bash tool and the real `tool_result` presentation hook.
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

import type { RuntimeBackend, RuntimeExecInput } from '@electron/features/workspace/runtime/types';
import { getRuntimeCapabilities } from '@electron/features/workspace/runtime/capabilities';
import { createBash } from '@electron/features/container/tools/tools-coding';
import { registerToolResultPresentation } from '@electron/features/tool-capture/tool-result-presentation';
import { clearToolResultsForTests } from '@electron/features/tool-capture/tool-results';
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

/** Calls the Sero bash tool with a failing command, then answers. */
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
      input.outputSink?.write('stdout', 'command output\n');
      input.outputSink?.write('stderr', 'command failed\n');
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
  clearToolResultsForTests();
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup().catch(() => undefined)));
});

describe('tool_result presentation for a rejected bash command', () => {
  it('fires the hook after the rejection and replaces the content and details', async () => {
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

    const observedErrors: boolean[] = [];
    const settingsManager = await SettingsManager.create(cwd, agentDir);
    const loader = new DefaultResourceLoader({
      cwd,
      agentDir,
      settingsManager,
      extensionFactories: [
        (pi: ExtensionAPI) => {
          // Observe the rejection before the presentation hook rewrites it.
          pi.on('tool_result', (event) => {
            if (event.toolName === 'bash' && !(event.details as { capture?: unknown } | undefined)?.capture) {
              observedErrors.push(event.isError);
            }
            return undefined;
          });
          registerToolResultPresentation(pi);
        },
      ],
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

    cleanups.push(async () => {
      session.dispose();
      await fixture.close();
      await rm(root, { recursive: true, force: true });
    });

    await session.prompt('Run the failing command.');

    const toolResult = session.messages.find(
      (message) => (message as PersistedToolResult).role === 'toolResult',
    ) as PersistedToolResult | undefined;

    // The hook ran on the rejection path and saw isError.
    expect(observedErrors).toEqual([true]);

    // The persisted result keeps the capture, the exit code and both blocks.
    expect(toolResult?.isError).toBe(true);
    expect(toolResult?.details?.exitCode).toBe(3);
    expect(toolResult?.details?.capture).toMatchObject({ complete: true, producerSessionId: SESSION });
    expect(toolResult?.content).toHaveLength(2);
    expect(toolResult?.content?.[0]?.text).toContain('Command exited with code 3');
    expect(toolResult?.content?.[1]?.text).toContain('Complete output:');
  });
});

import { describe, expect, it, vi } from 'vitest';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

const mocks = vi.hoisted(() => ({
  registerSharedIsolatedCompletionHost: vi.fn(),
}));

vi.mock('@electron/shared/infra/isolated-completion-host', () => ({
  registerSharedIsolatedCompletionHost: mocks.registerSharedIsolatedCompletionHost,
}));

vi.mock('@electron/features/container/tools/system-prompt', () => ({
  buildContainerPromptBlock: vi.fn(() => ''),
}));

vi.mock('@electron/cli', () => ({
  buildCliPromptBlock: vi.fn(() => '\n## Sero CLI'),
}));

vi.mock('@electron/ipc/editor/debug', () => ({
  logProviderRequest: vi.fn(),
}));

vi.mock('@electron/platform/desktop/notifications', () => ({
  showNotification: vi.fn(),
}));

import { createSubagentExtensionFactory } from '@electron/features/subagent/runtime/loader';

describe('subagent extension loader', () => {
  it('registers the shared isolated-completion host', () => {
    const events = { on: vi.fn() };
    const pi = { events, on: vi.fn() } as unknown as ExtensionAPI;
    const factory = createSubagentExtensionFactory(
      {} as Parameters<typeof createSubagentExtensionFactory>[0],
      'workspace-1',
      'session-1',
    );

    factory(pi);

    expect(mocks.registerSharedIsolatedCompletionHost).toHaveBeenCalledWith(events);
  });

  /** The `before_agent_start` handler a session gets, run with the tools that are active in it. */
  async function startPrompt(activeTools: string[]): Promise<string> {
    let handler: ((event: { systemPrompt: string }) => Promise<{ systemPrompt: string } | undefined>) | undefined;
    const pi = {
      events: { on: vi.fn() },
      on: vi.fn((name: string, fn: typeof handler) => { if (name === 'before_agent_start') handler = fn; }),
      getActiveTools: () => activeTools,
    } as unknown as ExtensionAPI;
    createSubagentExtensionFactory({} as Parameters<typeof createSubagentExtensionFactory>[0], 'workspace-1', 'session-1')(pi);
    const result = await handler?.({ systemPrompt: 'base' });
    return result?.systemPrompt ?? 'base';
  }

  it('leaves set-title out of the CLI block, because a subagent has no chat to title', async () => {
    const { buildCliPromptBlock } = await import('@electron/cli');
    await startPrompt(['read', 'sero-cli']);
    expect(vi.mocked(buildCliPromptBlock).mock.calls.at(-1)?.[2]).toMatchObject({ omitCommands: ['set-title'] });
  });

  it('adds the Sero CLI block only when the session has sero-cli', async () => {
    expect(await startPrompt(['read', 'sero-cli'])).toContain('## Sero CLI');
    expect(await startPrompt(['read'])).toBe('base');
  });
});

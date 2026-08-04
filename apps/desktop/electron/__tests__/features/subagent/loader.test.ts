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
  buildCliPromptBlock: vi.fn(() => ''),
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
});

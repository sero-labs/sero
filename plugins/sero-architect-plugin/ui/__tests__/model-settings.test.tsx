// @vitest-environment jsdom

/**
 * Project model defaults (spec architect-model-overrides).
 *
 * `record.modelTiers` is a cache the owner session refreshes only when it
 * opens, so it can be stale. This view must gate on its own fresh read of
 * the host rather than ever showing that cache as if it were live.
 */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

import { FIXTURES } from '../__preview__/fixture';
import { ModelSettings } from '../components/ModelSettings';
import type { ActionOutcome, ArchitectActions } from '../lib/actions';

vi.mock('@sero-ai/app-runtime', () => ({
  useAvailableModels: () => ({
    groups: [{
      provider: 'anthropic',
      displayName: 'Anthropic',
      logo: '',
      models: [
        { provider: 'anthropic', modelId: 'claude-fable-5-1', name: 'Fable', reasoning: true, availableThinkingLevels: ['low', 'medium', 'high'] },
        { provider: 'anthropic', modelId: 'claude-sonnet-5', name: 'Sonnet', reasoning: true, availableThinkingLevels: ['low', 'medium', 'high'] },
      ],
    }],
  }),
}));

vi.mock('@sero-ai/ui', () => ({
  Button: ({ children, ...props }: { children: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props}>{children}</button>
  ),
}));

function actionsOver(overrides: Partial<ArchitectActions> = {}): ArchitectActions {
  const ok = () => vi.fn(async (): Promise<ActionOutcome> => ({ ok: true, text: 'done' }));
  return {
    create: ok(), history: vi.fn(async () => ({ ok: true, text: 'done', entries: [] })),
    trace: vi.fn(async () => ({ ok: true, text: 'done', page: null })),
    pause: ok(), resume: ok(), retry: ok(), stop: ok(), remove: ok(), raiseCap: ok(),
    setExecutionMode: ok(), setAutonomy: ok(), approveCharter: ok(), approveMilestone: ok(),
    answer: ok(), directive: ok(), setModelDefault: ok(), clearModelDefault: ok(),
    refreshModelTiers: vi.fn(async () => ({ ok: true, text: 'done' })),
    ...overrides,
  };
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const flush = () => act(async () => { await Promise.resolve(); });

const staleRecord = {
  ...FIXTURES.build!,
  modelTiers: { MED: { provider: 'anthropic', modelId: 'claude-fable-5-1' as const, thinkingLevel: 'low' as const } },
};

describe('reading the authoritative tiers', () => {
  it('disables every control until the refresh resolves, and shows a fetched model over the cached one', async () => {
    let resolveRefresh: ((value: ActionOutcome & { tiers?: Record<string, unknown> }) => void) | undefined;
    const refreshModelTiers = vi.fn(() => new Promise<ActionOutcome & { tiers?: Record<string, unknown> }>((resolve) => { resolveRefresh = resolve; }));
    act(() => root.render(
      <ModelSettings record={staleRecord} actions={actionsOver({ refreshModelTiers })} onBack={vi.fn()} />,
    ));
    await flush();

    // Before the refresh resolves, the cached model must not be shown as the
    // live effective one, and nothing is editable.
    expect(container.textContent).toContain('Reading the current model defaults');
    const selects = [...container.querySelectorAll('select')];
    expect(selects.length).toBeGreaterThan(0);
    for (const select of selects) expect(select.disabled).toBe(true);
    expect(container.textContent).not.toContain('claude-fable-5-1');

    act(() => {
      resolveRefresh!({
        ok: true,
        text: 'done',
        tiers: { MED: { provider: 'anthropic', modelId: 'claude-sonnet-5', thinkingLevel: 'high' } },
      });
    });
    await flush();

    // The refreshed model is now the effective one, distinct from the stale cache.
    expect(container.textContent).not.toContain('Reading the current model defaults');
    expect(container.textContent).toContain('anthropic/claude-sonnet-5');
    const medSelect = container.querySelector<HTMLSelectElement>('[aria-label="MED project model"]');
    expect(medSelect?.disabled).toBe(false);
    expect(medSelect?.value).toBe('anthropic/claude-sonnet-5');
  });

  it('keeps every control disabled and shows the failure when the refresh fails', async () => {
    const refreshModelTiers = vi.fn(async () => ({ ok: false, text: 'the host could not be reached' }) as ActionOutcome);
    act(() => root.render(
      <ModelSettings record={staleRecord} actions={actionsOver({ refreshModelTiers })} onBack={vi.fn()} />,
    ));
    await flush();

    expect(container.textContent).toContain('the host could not be reached');
    expect(container.textContent).not.toContain('Reading the current model defaults');
    for (const select of [...container.querySelectorAll('select')]) expect(select.disabled).toBe(true);
  });
});

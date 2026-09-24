// @vitest-environment jsdom

/**
 * Project model defaults (spec architect-model-overrides).
 *
 * `record.modelTiers` is a cache the owner session refreshes only when it
 * opens, so it can be stale. This view must gate on its own fresh read of
 * the host rather than ever showing that cache as if it were live.
 *
 * With the Architect off, the captured page read "Not selected · choose a
 * model to run work" on all three tiers, while the note under the table said
 * the owner was running gpt-5.6-luna with high thinking. Nothing was
 * unselected: the page could not reach the host that holds the selections.
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

vi.mock('@sero-ai/ui', async () => ({
  Button: ({ children, ...props }: { children: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props}>{children}</button>
  ),
  ...(await import('./select-stand-in')),
}));

vi.mock('@sero-ai/ui/model-selection/available-model-picker', async () => await import('./model-picker-stand-in'));

function actionsOver(overrides: Partial<ArchitectActions> = {}): ArchitectActions {
  const ok = () => vi.fn(async (): Promise<ActionOutcome> => ({ ok: true, text: 'done' }));
  return {
    create: ok(), history: vi.fn(async () => ({ ok: true, text: 'done', entries: [] })),
    trace: vi.fn(async () => ({ ok: true, text: 'done', page: null })),
    lifetime: vi.fn(async () => ({ ok: true, text: 'done', lifetime: null })),
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
      <ModelSettings record={staleRecord} actions={actionsOver({ refreshModelTiers })} runtimeRunning onBack={vi.fn()} />,
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
    expect(container.textContent).toContain('claude-sonnet-5 · high');
    const medSelect = container.querySelector<HTMLSelectElement>('[aria-label="MED project model"]');
    expect(medSelect?.disabled).toBe(false);
    expect(medSelect?.value).toBe('anthropic/claude-sonnet-5');
  });

  it('keeps every control disabled and shows the failure when the refresh fails', async () => {
    const refreshModelTiers = vi.fn(async () => ({ ok: false, text: 'the host could not be reached' }) as ActionOutcome);
    act(() => root.render(
      <ModelSettings record={staleRecord} actions={actionsOver({ refreshModelTiers })} runtimeRunning onBack={vi.fn()} />,
    ));
    await flush();

    expect(container.textContent).toContain('the host could not be reached');
    expect(container.textContent).not.toContain('Reading the current model defaults');
    for (const select of [...container.querySelectorAll('select')]) expect(select.disabled).toBe(true);
  });
});

const ENVIRONMENT_PINNED = {
  ...staleRecord,
  session: {
    ...staleRecord.session,
    model: 'openai/gpt-5.6-luna',
    thinking: 'high',
    modelSource: 'owner-environment-pin' as const,
    modelOutranks: 'MED' as const,
  },
};

function renderPage(record: typeof staleRecord, runtimeRunning: boolean, actions = actionsOver()) {
  act(() => root.render(
    <ModelSettings record={record} actions={actions} runtimeRunning={runtimeRunning} onBack={vi.fn()} />,
  ));
}

/** The table's rows, each as its cells' text. */
function rows(): string[][] {
  return [...container.querySelectorAll('tbody tr')]
    .map((row) => [...row.querySelectorAll('td')].map((cell) => cell.textContent ?? ''));
}

describe('the owner row', () => {
  it('states an environment pin, what it outranks, what runs and where it came from', async () => {
    renderPage(ENVIRONMENT_PINNED, true);
    await flush();
    const owner = rows().find((cells) => cells[0] === 'OWNER');
    expect(owner).toBeDefined();
    expect(owner![1]).toBe('Pinned by the owner environment. It outranks the MED tier.');
    expect(owner![2]).toContain('openai/gpt-5.6-luna');
    // The Effective column names the model only; the thinking level has its own picker.
    expect(owner![2]).not.toContain('thinking');
    expect(owner![3]).toBe('environment');
    // The two sentences under the table are gone; the row replaces them.
    expect(container.textContent).not.toContain('The owner is running');
  });

  it('marks the selection as last known while the Architect is off', async () => {
    renderPage(ENVIRONMENT_PINNED, false, actionsOver({
      refreshModelTiers: vi.fn(async () => ({ ok: false, text: 'the Architect runtime is not running' })),
    }));
    await flush();
    const owner = rows().find((cells) => cells[0] === 'OWNER');
    // What is on the record is the last reading, not a live one, so the page
    // does not claim the rule that produced it still holds.
    expect(owner![1]).toBe('Last known');
    expect(owner![2]).toContain('openai/gpt-5.6-luna');
    // Where it came from is a fact about the record, so it is still named.
    expect(owner![3]).toBe('environment');
  });
});

describe('a tier that inherits a global it cannot read', () => {
  const unreachable = () => actionsOver({
    refreshModelTiers: vi.fn(async () => ({ ok: false, text: 'the Architect runtime is not running' })),
  });

  it('says the global cannot be read, rather than asking the user to choose', async () => {
    renderPage(staleRecord, false, unreachable());
    await flush();
    for (const tier of ['LOW', 'MED', 'HIGH']) {
      const row = rows().find((cells) => cells[0] === tier);
      expect(row![2], tier).toContain('cannot be read while Architect is off');
      expect(row![2], tier).not.toContain('Not selected');
      expect(row![2], tier).not.toContain('choose a model to run work');
      expect(row![3], tier).toBe('global');
    }
  });

  it('keeps an overridden tier showing its own override', async () => {
    const overridden = {
      ...staleRecord,
      modelOverrides: { HIGH: { provider: 'anthropic', modelId: 'claude-sonnet-5' as const, thinkingLevel: 'high' as const } },
    };
    renderPage(overridden, false, unreachable());
    await flush();
    const high = rows().find((cells) => cells[0] === 'HIGH');
    expect(high![2]).toContain('claude-sonnet-5');
    expect(high![2]).not.toContain('cannot be read');
    expect(high![3]).toBe('project');
  });

  it('resolves every inherited tier once the read lands, with nothing for the user to do', async () => {
    renderPage(staleRecord, true, actionsOver({
      refreshModelTiers: vi.fn(async () => ({
        ok: true,
        text: 'done',
        tiers: { LOW: { provider: 'anthropic', modelId: 'claude-fable-5-1' as const, thinkingLevel: 'low' as const } },
      })),
    }));
    await flush();
    const low = rows().find((cells) => cells[0] === 'LOW');
    expect(low![2]).toContain('claude-fable-5-1');
    expect(container.textContent).not.toContain('cannot be read while Architect is off');
  });

  it('labels the inherited choice Global while the global cannot be read', async () => {
    renderPage(staleRecord, false, unreachable());
    await flush();
    const field = container.querySelector<HTMLSelectElement>('[aria-label="LOW project model"]')!;
    expect([...field.options].map((option) => option.textContent)[0]).toBe('Global');
  });
});

describe('choosing a tier model', () => {
  it('restores inheritance when the first choice is picked', async () => {
    const clearModelDefault = vi.fn(async (): Promise<ActionOutcome> => ({ ok: true, text: 'done' }));
    const overridden = {
      ...staleRecord,
      modelOverrides: { MED: { provider: 'anthropic', modelId: 'claude-sonnet-5' as const, thinkingLevel: 'high' as const } },
    };
    renderPage(overridden, true, actionsOver({ clearModelDefault }));
    await flush();

    const field = container.querySelector<HTMLSelectElement>('[aria-label="MED project model"]')!;
    expect(field.value).toBe('anthropic/claude-sonnet-5');
    act(() => {
      field.value = '__none__';
      field.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(clearModelDefault).toHaveBeenCalledWith(overridden.id, 'MED');
  });

  it('saves a picked model with its thinking level', async () => {
    const setModelDefault = vi.fn(async (): Promise<ActionOutcome> => ({ ok: true, text: 'done' }));
    renderPage(staleRecord, true, actionsOver({ setModelDefault }));
    await flush();

    const field = container.querySelector<HTMLSelectElement>('[aria-label="LOW project model"]')!;
    act(() => {
      field.value = 'anthropic/claude-sonnet-5';
      field.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(setModelDefault).toHaveBeenCalledWith(staleRecord.id, 'LOW', 'anthropic/claude-sonnet-5', 'low');
  });
});

describe('when a saved change takes effect', () => {
  it('is one disclosure, not a rule beside each tier', async () => {
    renderPage(staleRecord, true);
    await flush();
    const folds = [...container.querySelectorAll('details')];
    expect(folds).toHaveLength(1);
    expect(folds[0].querySelector('summary')?.textContent).toBe('When a change takes effect');
    expect(folds[0].textContent).toContain('Saving affects new dispatches');
    // Once in the fold, and nowhere else on the page.
    const occurrences = (container.textContent ?? '').split('Saving affects new dispatches').length - 1;
    expect(occurrences).toBe(1);
  });
});

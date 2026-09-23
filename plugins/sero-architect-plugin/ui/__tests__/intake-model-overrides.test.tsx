// @vitest-environment jsdom

/**
 * New project Model overrides use the same field as Project models, with the
 * inherited choice first. A tier left on that choice sends nothing, so the
 * project inherits exactly as it would without this section.
 */

import { act, useState, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ModelChoice } from '../lib/actions';
import { IntakeModelOverrides } from '../components/IntakeModelOverrides';

vi.mock('@sero-ai/ui', async () => ({
  ...(await import('./select-stand-in')),
  Collapsible: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  CollapsibleTrigger: ({ children }: { children?: ReactNode }) => <button type="button">{children}</button>,
  CollapsibleContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

vi.mock('@sero-ai/ui/model-selection/available-model-picker', async () => await import('./model-picker-stand-in'));

vi.mock('@sero-ai/app-runtime', () => ({
  useAvailableModels: () => ({
    groups: [{
      provider: 'anthropic',
      displayName: 'Anthropic',
      logo: '',
      models: [
        { provider: 'anthropic', modelId: 'claude-sonnet-5', name: 'Sonnet', reasoning: true, availableThinkingLevels: ['low', 'medium', 'high'] },
      ],
    }],
  }),
}));

let container: HTMLDivElement;
let root: Root;
let latest: ModelChoice[] = [];

function Harness({ initial = [] as ModelChoice[] }) {
  const [choices, setChoices] = useState<ModelChoice[]>(initial);
  latest = choices;
  return <IntakeModelOverrides choices={choices} onChange={setChoices} disabled={false} />;
}

beforeEach(() => {
  Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  latest = [];
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
});

function field(tier: string) {
  return container.querySelector<HTMLSelectElement>(`[aria-label="${tier} model"]`)!;
}

function change(element: HTMLSelectElement, value: string) {
  act(() => {
    element.value = value;
    element.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

describe('New project Model overrides', () => {
  it('lists the inherited choice first', () => {
    act(() => root.render(<Harness />));
    const options = [...field('LOW').options];
    expect(options[0].textContent).toBe('Global selection');
    expect(options[1].value).toBe('anthropic/claude-sonnet-5');
  });

  it('records a chosen tier with its thinking level', () => {
    act(() => root.render(<Harness />));
    change(field('MED'), 'anthropic/claude-sonnet-5');

    expect(latest).toEqual([{ tier: 'MED', model: 'anthropic/claude-sonnet-5', thinking: 'low' }]);
  });

  it('keeps the thinking picker beside the model field', () => {
    act(() => root.render(<Harness initial={[{ tier: 'MED', model: 'anthropic/claude-sonnet-5', thinking: 'low' }]} />));
    const thinking = container.querySelector('[aria-label="MED thinking level"]');
    expect(thinking).not.toBeNull();
    expect(field('MED').parentElement).toBe(thinking?.parentElement);
  });

  it('clears a tier back to the inherited choice', () => {
    act(() => root.render(<Harness initial={[{ tier: 'MED', model: 'anthropic/claude-sonnet-5', thinking: 'low' }]} />));
    change(field('MED'), '__global__');
    expect(latest).toEqual([]);
  });
});

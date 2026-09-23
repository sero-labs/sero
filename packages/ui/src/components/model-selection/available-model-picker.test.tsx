import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AvailableModelPicker } from './available-model-picker';
import {
  buildModelPickerOptions,
  matchesModelPickerQuery,
  type ModelPickerOption,
} from './model-picker-options';

const GROUPS = [
  {
    provider: 'openai-codex',
    displayName: 'OpenAI Codex',
    logo: '',
    models: [
      { provider: 'openai-codex', modelId: 'gpt-5.6-sol', name: 'GPT-5.6 Sol', reasoning: true },
      { provider: 'openai-codex', modelId: 'gpt-6-astra', name: 'GPT-6 Astra', reasoning: true },
    ],
  },
  {
    provider: 'anthropic',
    displayName: 'Anthropic',
    logo: '',
    models: [
      { provider: 'anthropic', modelId: 'claude-fable-5', name: 'Claude Fable 5', reasoning: true },
    ],
  },
];

const TIERS = [
  { value: '', label: 'Auto (default)' },
  { value: 'LOW', label: 'LOW' },
  { value: 'MED', label: 'MED' },
];

function values(options: ModelPickerOption[], text: string) {
  return options.filter((option) => matchesModelPickerQuery(option, text)).map((option) => option.value);
}

describe('the picker list', () => {
  it('lists the fixed choices first, then every model under its provider', () => {
    const options = buildModelPickerOptions(GROUPS, TIERS);

    expect(options.slice(0, 3).map((option) => option.label)).toEqual([
      'Auto (default)',
      'LOW',
      'MED',
    ]);
    expect(options.slice(3).map((option) => option.value)).toEqual([
      'openai-codex/gpt-5.6-sol',
      'openai-codex/gpt-6-astra',
      'anthropic/claude-fable-5',
    ]);
    // Every model row carries its provider, so the row can name it.
    expect(options[3].provider).toBe('OpenAI Codex');
    expect(options[5].provider).toBe('Anthropic');
    // A fixed choice has no provider.
    expect(options[0].provider).toBe('');
  });

  it('appends a saved value the catalogue does not hold', () => {
    const options = buildModelPickerOptions(GROUPS, TIERS, 'ghost/removed');
    expect(options.at(-1)).toEqual({ value: 'ghost/removed', label: 'ghost/removed', provider: '', modelId: '' });
  });

  it('does not append a saved value that is already listed', () => {
    const options = buildModelPickerOptions(GROUPS, TIERS, 'LOW');
    expect(options.filter((option) => option.value === 'LOW')).toHaveLength(1);
  });

  it('filters by provider', () => {
    expect(values(buildModelPickerOptions(GROUPS, TIERS), 'anthropic')).toEqual([
      'anthropic/claude-fable-5',
    ]);
  });

  it('filters by model name', () => {
    expect(values(buildModelPickerOptions(GROUPS, TIERS), 'astra')).toEqual([
      'openai-codex/gpt-6-astra',
    ]);
  });

  it('filters by model id', () => {
    expect(values(buildModelPickerOptions(GROUPS, TIERS), 'fable-5')).toEqual([
      'anthropic/claude-fable-5',
    ]);
  });

  it('matches the provider by its display name, not by its key', () => {
    const options = buildModelPickerOptions(GROUPS, TIERS);
    // The display name is the searchable provider. The key is not.
    expect(values(options, 'openai codex')).toEqual([
      'openai-codex/gpt-5.6-sol',
      'openai-codex/gpt-6-astra',
    ]);
    expect(values(options, 'openai-codex')).toHaveLength(0);
  });

  it('filters the fixed choices with the same query as the models', () => {
    expect(values(buildModelPickerOptions(GROUPS, TIERS), 'low')).toEqual(['LOW']);
  });

  it('shows every option when the query is empty', () => {
    const options = buildModelPickerOptions(GROUPS, TIERS);
    expect(values(options, '   ')).toEqual(options.map((option) => option.value));
  });
});

describe('AvailableModelPicker', () => {
  let host: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeAll(() => {
    // Base UI positions its popup with layout observers jsdom does not ship.
    if (!('ResizeObserver' in globalThis)) {
      (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
      };
    }
    Element.prototype.scrollIntoView ??= () => {};
  });

  afterEach(() => {
    if (root) act(() => root!.unmount());
    host?.remove();
    root = null;
    host = null;
  });

  type PickerProps = {
    groups: typeof GROUPS;
    value: string;
    onChange: (value: string) => void;
    leadingOptions?: ReadonlyArray<{ value: string; label: string }>;
    allowClear?: boolean;
  };
  const Picker = AvailableModelPicker as unknown as (props: PickerProps) => React.ReactElement;

  function render(props: PickerProps) {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root!.render(<Picker {...props} />));
    return host;
  }

  async function openList(container: HTMLElement) {
    const trigger = container.querySelector('button[aria-label="Open model list"]');
    expect(trigger).not.toBeNull();
    await act(async () => {
      trigger!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
      trigger!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      trigger!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }

  async function type(input: HTMLInputElement, text: string) {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    await act(async () => {
      setter.call(input, text);
      input.dispatchEvent(new InputEvent('input', { bubbles: true, data: text, inputType: 'insertText' }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }

  function rows() {
    return [...document.querySelectorAll('[role="option"]')];
  }

  it('names the chosen model and its provider when closed', () => {
    const container = render({ groups: GROUPS, value: 'anthropic/claude-fable-5', onChange: vi.fn() });
    expect(container.querySelector('input')!.value).toBe('Claude Fable 5');
    expect(container.textContent).toContain('Anthropic');
  });

  it('keeps a saved value the catalogue does not hold when closed', () => {
    const container = render({ groups: GROUPS, value: 'ghost/removed', onChange: vi.fn() });
    expect(container.querySelector('input')!.value).toBe('ghost/removed');
  });

  it('shows a fixed choice by its label when closed', () => {
    const container = render({ groups: GROUPS, value: 'MED', onChange: vi.fn(), leadingOptions: TIERS });
    expect(container.querySelector('input')!.value).toBe('MED');
  });

  it('names each listed row\u2019s provider and marks the chosen one', async () => {
    const container = render({ groups: GROUPS, value: 'anthropic/claude-fable-5', onChange: vi.fn() });
    await openList(container);

    const labels = rows().map((row) => row.textContent ?? '');
    expect(labels.some((row) => row.includes('GPT-5.6 Sol') && row.includes('OpenAI Codex'))).toBe(true);
    expect(labels.some((row) => row.includes('Claude Fable 5') && row.includes('Anthropic'))).toBe(true);

    const chosen = rows().find((row) => (row.textContent ?? '').includes('Claude Fable 5'));
    expect(chosen?.getAttribute('aria-selected')).toBe('true');
  });

  it('narrows the rows to the typed provider', async () => {
    const container = render({ groups: GROUPS, value: '', onChange: vi.fn() });
    await openList(container);
    await type(container.querySelector('input')!, 'anthropic');

    const labels = rows().map((row) => row.textContent ?? '');
    expect(labels).toHaveLength(1);
    expect(labels[0]).toContain('Claude Fable 5');
  });

  it('picks the highlighted row with Enter', async () => {
    const onChange = vi.fn();
    const container = render({ groups: GROUPS, value: '', onChange });
    await openList(container);
    const input = container.querySelector('input')!;
    await type(input, 'astra');

    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(onChange).toHaveBeenCalledWith('openai-codex/gpt-6-astra');
  });

  it('offers one control that clears the value', async () => {
    const onChange = vi.fn();
    const container = render({
      groups: GROUPS,
      value: 'anthropic/claude-fable-5',
      onChange,
      allowClear: true,
    });

    const clear = container.querySelector('[data-slot="combobox-clear"]');
    expect(clear).not.toBeNull();
    await act(async () => {
      clear!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(onChange).toHaveBeenCalledWith('');
  });
});

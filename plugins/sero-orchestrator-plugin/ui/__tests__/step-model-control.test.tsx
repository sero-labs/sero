// @vitest-environment jsdom

/**
 * A step's model is one field.
 *
 * The captured Tune panel put Auto, the tiers and a separate searchable
 * picker behind "Specific model…". The drawing folds them into one
 * type-to-filter field, with the tiers first and the provider on every model.
 */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppModelGroup } from '@sero-ai/app-runtime';
import type { LoopStepDefinition } from '../../shared/types';
import { StepModelControl } from '../components/StepModelControl';

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
] as unknown as AppModelGroup[];

function step(model?: string): LoopStepDefinition {
  return {
    id: 'implement',
    title: 'Implement accessible composable title search',
    instructions: 'Do the work.',
    execution: { type: 'background-agent', ...(model ? { model } : {}) },
  } as unknown as LoopStepDefinition;
}

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.scrollIntoView = () => {};
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  document.body.innerHTML = '';
  Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
});

function render(model: string | undefined, onChange = vi.fn()) {
  const target = step(model);
  act(() => {
    root.render(<StepModelControl step={target} groups={GROUPS} onChange={onChange} />);
  });
  return { onChange, target };
}

function input() {
  return host.querySelector<HTMLInputElement>(`input[aria-label="Model for ${step().title}"]`)!;
}

async function openList() {
  const trigger = host.querySelector<HTMLButtonElement>(
    `button[aria-label="Open Model for ${step().title}"]`,
  )!;
  await act(async () => {
    trigger.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    trigger.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    trigger.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function rows() {
  return [...document.querySelectorAll('[role="option"]')].map((row) => row.textContent ?? '');
}

describe('a step with no model override', () => {
  it('reads Auto and lists the tiers before every model', async () => {
    render(undefined);
    expect(input().value).toBe('Auto (default)');

    await openList();
    expect(rows().slice(0, 4)).toEqual(['Auto (default)', 'LOW', 'MED', 'HIGH']);
    expect(rows().some((row) => row.includes('GPT-5.6 Sol') && row.includes('OpenAI Codex'))).toBe(true);
  });

  it('records a picked tier', async () => {
    const { onChange } = render(undefined);
    await openList();

    const low = [...document.querySelectorAll<HTMLElement>('[role="option"]')]
      .find((row) => row.textContent === 'LOW')!;
    await act(async () => {
      low.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(onChange).toHaveBeenCalledWith('LOW', undefined);
  });

  it('offers no clear control beside a tier, which is not a pin', () => {
    render('MED');
    expect(host.querySelector('[data-slot="combobox-clear"]')).toBeNull();
  });
});

describe('a step with a pinned model', () => {
  it('names the model and its provider in the field', () => {
    render('anthropic/claude-fable-5');
    expect(input().value).toBe('Claude Fable 5');
    expect(host.textContent).toContain('Anthropic');
  });

  it('pins the highlighted model from the keyboard', async () => {
    const { onChange } = render(undefined);
    await openList();

    const field = input();
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    await act(async () => {
      setter.call(field, 'astra');
      field.dispatchEvent(new InputEvent('input', { bubbles: true, data: 'astra', inputType: 'insertText' }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await act(async () => {
      field.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(onChange).toHaveBeenCalledWith('openai-codex/gpt-6-astra', undefined);
  });

  it('clears the pin back to Auto', async () => {
    const { onChange } = render('anthropic/claude-fable-5');
    const clear = host.querySelector<HTMLElement>('[data-slot="combobox-clear"]')!;
    expect(clear).not.toBeNull();

    await act(async () => {
      clear.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(onChange).toHaveBeenCalledWith(undefined, undefined);
  });
});

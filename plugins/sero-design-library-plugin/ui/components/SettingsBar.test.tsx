// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsBar } from './SettingsBar';

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(() => {
  Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  container.remove();
  root = null;
  Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
});

describe('SettingsBar', () => {
  it('offers only the approved first-release settings', async () => {
    const onChange = vi.fn();
    await act(async () => {
      root?.render(
        <SettingsBar
          onChange={onChange}
          settings={{ variantCount: 3, revisionBehaviour: 'replace' }}
        />,
      );
    });

    expect(container.textContent).toContain('Variants per run');
    expect(container.textContent).toContain('Revision result');
    expect(container.querySelectorAll('[data-slot="select-trigger"]')).toHaveLength(2);
  });

  it('shows the current profile settings on its triggers', async () => {
    await act(async () => {
      root?.render(
        <SettingsBar
          onChange={vi.fn()}
          settings={{ variantCount: 5, revisionBehaviour: 'retain' }}
        />,
      );
    });

    const triggers = container.querySelectorAll('[data-slot="select-trigger"]');
    expect(triggers[0].textContent).toContain('5');
    expect(triggers[1].textContent).toContain('Retain both results');
  });
});

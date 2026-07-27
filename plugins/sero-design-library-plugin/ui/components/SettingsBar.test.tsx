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
  it('is a single labelled control until it is opened', async () => {
    await act(async () => {
      root?.render(
        <SettingsBar
          onChange={vi.fn()}
          settings={{ variantCount: 3, revisionBehaviour: 'replace' }}
        />,
      );
    });

    const trigger = container.querySelector('button[aria-label="Design Library settings"]');
    expect(trigger).not.toBeNull();
    // Nothing is mounted until the user asks for it.
    expect(container.querySelectorAll('[data-slot="select-trigger"]')).toHaveLength(0);
  });
});

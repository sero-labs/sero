// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DesignLibraryApp } from './DesignLibraryApp';

describe('DesignLibraryApp', () => {
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

  it('renders the uniform Library shell with ordered fixture selection', async () => {
    await renderApp(root);

    expect(container.textContent).toContain('Northstar operations');
    expect(container.textContent).toContain('Evening finance');
    expect(container.textContent).toContain('Librarian analysing');
    expect(container.textContent).toContain('Analysis needs attention');
    expect(container.textContent).toContain('3 references selected');
    expect(container.textContent).toContain('Primary');
    expect(container.querySelectorAll('.dl-library-card')).toHaveLength(8);
  });

  it('shows the empty state when fixture search has no matches', async () => {
    await renderApp(root);

    const search = container.querySelector<HTMLInputElement>('input[aria-label="Search inspiration"]');
    if (!search) throw new Error('Search input not found');

    await act(async () => {
      setInputValue(search, 'does-not-exist');
    });

    expect(container.textContent).toContain('No inspiration found');
    expect(container.querySelectorAll('.dl-library-card')).toHaveLength(0);
  });

  it('navigates through Design warning, error and Gallery fixture states', async () => {
    await renderApp(root);

    await act(async () => clickButton(container, 'Design'));
    expect(container.textContent).toContain('Agent operations');
    expect(container.textContent).toContain('Signal ledger');

    await act(async () => clickButton(container, 'Operational field'));
    expect(container.textContent).toContain('2 restricted capabilities blocked');

    await act(async () => clickButton(container, 'Quiet grid'));
    expect(container.textContent).toContain('Variant generation failed');
    expect(container.textContent).toContain('Retry variant');

    await act(async () => clickButton(container, 'Gallery'));
    expect(container.textContent).toContain('Your Gallery');
    expect(container.querySelectorAll('.dl-gallery-card')).toHaveLength(4);
  });
});

async function renderApp(root: Root | null) {
  await act(async () => {
    root?.render(<DesignLibraryApp />);
    await Promise.resolve();
  });
}

function clickButton(container: HTMLElement, label: string) {
  const button = Array.from(container.querySelectorAll('button')).find((candidate) =>
    candidate.textContent?.includes(label),
  );
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Button not found: ${label}`);
  }
  button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'value',
  )?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

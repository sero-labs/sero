// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AutocompleteListbox,
  AutocompleteListboxHeader,
  AutocompleteListboxOption,
  useAutocompleteListbox,
} from './AutocompleteListbox';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

interface HarnessProps {
  items: string[];
  open: boolean;
  resetKey: string;
  onSelect: (item: string) => void;
  onClose: () => void;
}

function Harness({ items, open, resetKey, onSelect, onClose }: HarnessProps) {
  const listbox = useAutocompleteListbox({
    items,
    open,
    onSelect,
    onClose,
    resetKey,
  });

  if (!open || items.length === 0) return null;

  return (
    <AutocompleteListbox>
      <AutocompleteListboxHeader>Items</AutocompleteListboxHeader>
      {items.map((item, index) => (
        <AutocompleteListboxOption
          key={item}
          optionRef={listbox.registerItemRef(index)}
          selected={index === listbox.selectedIndex}
          onMouseEnter={() => listbox.setSelectedIndex(index)}
          onMouseDown={(event) => listbox.handleItemMouseDown(event, item)}
        >
          {item}
        </AutocompleteListboxOption>
      ))}
    </AutocompleteListbox>
  );
}

function getSelectedOptionText(container: HTMLElement) {
  const selected = container.querySelector('[role="option"][aria-selected="true"]');
  return selected?.textContent;
}

describe('AutocompleteListbox', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;
  let scrollIntoViewSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    scrollIntoViewSpy = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoViewSpy,
    });
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount();
      });
    }
    root = null;
    container.remove();
    vi.restoreAllMocks();
  });

  it('wraps keyboard navigation and keeps the selected option scrolled into view', async () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();

    await act(async () => {
      root?.render(
        <Harness
          items={['alpha', 'beta', 'gamma']}
          open={true}
          resetKey=""
          onSelect={onSelect}
          onClose={onClose}
        />,
      );
    });

    scrollIntoViewSpy.mockClear();

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    });

    expect(getSelectedOptionText(container)).toBe('gamma');
    expect(scrollIntoViewSpy).toHaveBeenCalledWith({ block: 'nearest' });

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    });

    expect(getSelectedOptionText(container)).toBe('alpha');
  });

  it('selects the highlighted option, resets on filter changes, and closes on escape', async () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();

    await act(async () => {
      root?.render(
        <Harness
          items={['alpha', 'beta', 'gamma']}
          open={true}
          resetKey="first"
          onSelect={onSelect}
          onClose={onClose}
        />,
      );
    });

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    });

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });

    expect(onSelect).toHaveBeenCalledWith('beta');
    expect(getSelectedOptionText(container)).toBe('beta');

    await act(async () => {
      root?.render(
        <Harness
          items={['alpha', 'beta', 'gamma']}
          open={true}
          resetKey="second"
          onSelect={onSelect}
          onClose={onClose}
        />,
      );
    });

    expect(getSelectedOptionText(container)).toBe('alpha');

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

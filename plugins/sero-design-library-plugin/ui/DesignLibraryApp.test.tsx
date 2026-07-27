// @vitest-environment jsdom

/**
 * The app shell against real reactive state, with the app-runtime hooks
 * replaced by an in-memory double. Every mutation the UI makes must arrive as
 * an app tool call — that is the contract these tests hold.
 */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_STATE, type DesignLibraryState } from '../shared/state';
import type { LibraryItemSummary } from '../shared/types';

const toolCalls: Array<{ tool: string; params: Record<string, unknown> }> = [];
const toolResults = new Map<string, unknown>();
let currentState: DesignLibraryState = structuredClone(DEFAULT_STATE);

vi.mock('@sero-ai/app-runtime', async () => {
  const { useReducer } = await import('react');
  return {
    // Mirrors the real file-backed hook: an updater function, and a re-render
    // when the document changes.
    useAppState: () => {
      const [, rerender] = useReducer((count: number) => count + 1, 0);
      return [
        currentState,
        (updater: (current: DesignLibraryState) => DesignLibraryState) => {
          currentState = updater(currentState);
          rerender();
        },
      ];
    },
    useAppTools: () => ({
      run: async (tool: string, params: Record<string, unknown>) => {
        toolCalls.push({ tool, params });
        return toolResults.get(`${tool}:${String(params.action)}`)
          ?? { text: '', content: [], details: null, isError: false };
      },
    }),
  };
});

const { DesignLibraryApp } = await import('./DesignLibraryApp');

function item(overrides: Partial<LibraryItemSummary> = {}): LibraryItemSummary {
  return {
    id: 'itm-1',
    title: 'Quiet ledger',
    primaryStyle: 'Editorial dashboard',
    tags: ['quiet', 'grid'],
    source: 'file-picker',
    colours: ['#101014'],
    analysisStatus: 'ready',
    createdAt: 1000,
    searchText: 'quiet ledger editorial dashboard',
    ...overrides,
  };
}

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(() => {
  Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
  toolCalls.length = 0;
  toolResults.clear();
  currentState = structuredClone(DEFAULT_STATE);
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

async function render() {
  await act(async () => {
    root?.render(<DesignLibraryApp />);
    await Promise.resolve();
  });
}

function clickLabelled(label: string) {
  const button = container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  if (!button) throw new Error(`Button not found: ${label}`);
  button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

function clickText(text: string) {
  const button = Array.from(container.querySelectorAll('button'))
    .find((candidate) => candidate.textContent?.includes(text));
  if (!(button instanceof HTMLButtonElement)) throw new Error(`Button not found: ${text}`);
  button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

function setInputValue(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('DesignLibraryApp', () => {
  it('shows the empty Library state before anything is imported', async () => {
    await render();
    expect(container.textContent).toContain('Your Library is empty');
    expect(container.querySelectorAll('.dl-library-card')).toHaveLength(0);
  });

  it('renders one uniform card per item with its analysis status', async () => {
    currentState = {
      ...currentState,
      items: [
        item(),
        item({ id: 'itm-2', title: 'Evening finance', analysisStatus: 'analysing' }),
        item({ id: 'itm-3', title: 'Broken one', analysisStatus: 'failed' }),
      ],
    };
    await render();

    expect(container.querySelectorAll('.dl-library-card')).toHaveLength(3);
    // The state is stated once, in place of the style line — never twice.
    expect(container.textContent).toContain('Analysing…');
    expect(container.textContent).toContain('Analysis needs attention');
    expect(container.querySelectorAll('.dl-dot--analysing')).toHaveLength(1);
    expect(container.querySelectorAll('.dl-dot--failed')).toHaveLength(1);
  });

  it('filters the grid by keyword search', async () => {
    currentState = { ...currentState, items: [item(), item({ id: 'itm-2', title: 'Evening finance' })] };
    await render();

    const search = container.querySelector<HTMLInputElement>('input[aria-label="Search inspiration"]');
    if (!search) throw new Error('Search input not found');

    await act(async () => setInputValue(search, 'evening'));
    expect(container.querySelectorAll('.dl-library-card')).toHaveLength(1);

    await act(async () => setInputValue(search, 'no-such-thing'));
    expect(container.textContent).toContain('No inspiration found');
  });

  it('orders the reference selection and marks the first as Primary', async () => {
    currentState = { ...currentState, items: [item(), item({ id: 'itm-2', title: 'Evening finance' })] };
    await render();

    await act(async () => clickLabelled('Add Evening finance to the selection'));
    await act(async () => clickLabelled('Add Quiet ledger to the selection'));

    expect(currentState.ui.referenceDraft).toEqual(['itm-2', 'itm-1']);
    expect(container.textContent).toContain('2 of 6 references selected · first is Primary');
  });

  it('creates a Design through the app tool with the ordered references', async () => {
    currentState = {
      ...currentState,
      items: [item()],
      ui: { ...currentState.ui, referenceDraft: ['itm-1'] },
    };
    toolResults.set('design_library_designs:create', {
      text: 'queued',
      content: [],
      details: { designId: 'dsn-1' },
      isError: false,
    });
    await render();

    await act(async () => clickText('Create Design'));

    const create = toolCalls.find((entry) => entry.params.action === 'create');
    expect(create?.tool).toBe('design_library_designs');
    expect(create?.params.itemIds).toEqual(['itm-1']);
    expect(currentState.ui.activePage).toBe('design');
    expect(currentState.ui.activeDesignId).toBe('dsn-1');
  });

  it('shows the empty Design and Gallery states', async () => {
    await render();

    await act(async () => clickText('Design'));
    expect(container.textContent).toContain('No Designs yet');

    await act(async () => clickText('Gallery'));
    expect(container.textContent).toContain('Your Gallery is empty');
  });

  it('surfaces runtime notices and dismisses them through the tool', async () => {
    currentState = {
      ...currentState,
      notices: [{
        id: 'ntc-1',
        level: 'warning',
        message: '2 tweak controls were removed',
        details: ['Ghost control: the design does not declare --ghost.'],
        createdAt: 1,
      }],
    };
    await render();

    expect(container.textContent).toContain('2 tweak controls were removed');
    await act(async () => clickLabelled('Dismiss'));
    expect(toolCalls.some((entry) => entry.params.action === 'dismiss_notice')).toBe(true);
  });

  it('keeps profile settings out of the standing chrome', async () => {
    await render();

    // Two settings do not deserve a permanent bar; they sit behind the header
    // control instead.
    expect(container.querySelector('.dl-settings-bar')).toBeNull();
    expect(
      container.querySelector('.dl-header__actions button[aria-label="Design Library settings"]'),
    ).not.toBeNull();
  });
});

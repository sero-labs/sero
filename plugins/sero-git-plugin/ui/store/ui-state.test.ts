// @vitest-environment jsdom

/**
 * How you left the app laid out is remembered, per workspace.
 *
 * The rail's sections and the history band used to be plain component state, so
 * every visit reopened everything and put the history back at its default
 * height — including the sections someone had deliberately folded away.
 */

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  normaliseViewState,
  useGitViewState,
  DEFAULT_GRAPH_HEIGHT_PCT,
  type GitViewState,
} from './ui-state';

const read = vi.fn<(path: string) => Promise<unknown>>();
const write = vi.fn<(path: string, data: unknown) => Promise<void>>();

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(() => {
  Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
  read.mockReset().mockResolvedValue({});
  write.mockReset().mockResolvedValue(undefined);
  Reflect.set(window, 'sero', { appState: { read, write } });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => { root?.unmount(); });
  container.remove();
  root = null;
});

/** The hook's live value and setter, without a testing-library dependency. */
interface Handle {
  state: GitViewState;
  update: (next: Partial<GitViewState>) => void;
}

async function mountHook(workspacePath: string): Promise<Handle> {
  const handle = {} as Handle;

  function Probe() {
    const [state, update] = useGitViewState(workspacePath);
    handle.state = state;
    handle.update = update;
    return null;
  }

  await act(async () => { root?.render(createElement(Probe)); });
  await act(async () => { await Promise.resolve(); });
  return handle;
}

describe('normaliseViewState', () => {
  it('falls back field by field, so an older file is not thrown away whole', () => {
    // Written before the sections were remembered: the height it does have is
    // kept, and the rest take their defaults.
    expect(normaliseViewState({ graphHeightPct: 50 })).toEqual({
      graphHeightPct: 50,
      graphCollapsed: false,
      localOpen: true,
      remoteOpen: true,
      stashesOpen: true,
    });
  });

  it('keeps the height inside the range the divider allows', () => {
    expect(normaliseViewState({ graphHeightPct: 99 }).graphHeightPct).toBe(80);
    expect(normaliseViewState({ graphHeightPct: 1 }).graphHeightPct).toBe(12);
    expect(normaliseViewState({ graphHeightPct: 'tall' }).graphHeightPct).toBe(DEFAULT_GRAPH_HEIGHT_PCT);
  });

  it('reads a folded rail back as folded', () => {
    const state = normaliseViewState({ localOpen: false, stashesOpen: false, graphCollapsed: true });
    expect(state).toMatchObject({ localOpen: false, remoteOpen: true, stashesOpen: false, graphCollapsed: true });
  });
});

describe('useGitViewState', () => {
  it('writes back the whole state, so one change cannot reset the others', async () => {
    read.mockResolvedValue({ graphHeightPct: 60, localOpen: false });

    const hook = await mountHook('/repo');
    expect(hook.state).toMatchObject({ graphHeightPct: 60, localOpen: false });

    // Collapsing the history must not reopen the section that was folded, nor
    // move the divider back to its default.
    await act(async () => { hook.update({ graphCollapsed: true }); });

    expect(write).toHaveBeenCalledWith('/repo/.sero/apps/git/view.json', {
      graphHeightPct: 60,
      graphCollapsed: true,
      localOpen: false,
      remoteOpen: true,
      stashesOpen: true,
    });
  });

  it('carries one change into the next, without waiting for a re-read', async () => {
    const hook = await mountHook('/repo');

    await act(async () => { hook.update({ localOpen: false }); });
    await act(async () => { hook.update({ remoteOpen: false }); });

    expect(write).toHaveBeenLastCalledWith(
      '/repo/.sero/apps/git/view.json',
      expect.objectContaining({ localOpen: false, remoteOpen: false }),
    );
  });

  it('treats a workspace with no saved layout as the default, not an error', async () => {
    read.mockRejectedValue(new Error('ENOENT'));

    const hook = await mountHook('/repo');

    expect(hook.state).toEqual({
      graphHeightPct: DEFAULT_GRAPH_HEIGHT_PCT,
      graphCollapsed: false,
      localOpen: true,
      remoteOpen: true,
      stashesOpen: true,
    });
  });
});

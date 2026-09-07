// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useArchitectView, viewId } from '../lib/navigation';

/** Stands in for the host shell: one remembered view id and a navigate that records its calls. */
let hostViewId: string | undefined;
let launchParams: { projectId?: string; intake?: boolean } | undefined;
const hostNavigate = vi.fn((next: string, options?: { replace?: boolean }) => {
  hostViewId = next;
  return options;
});

vi.mock('@sero-ai/app-runtime', () => ({
  useAppNavigation: () => ({ viewId: hostViewId, navigate: hostNavigate }),
  consumeAppLaunchParams: () => {
    const params = launchParams;
    launchParams = undefined;
    return params;
  },
  onAppLaunchParams: () => () => undefined,
}));

function Harness() {
  const [view] = useArchitectView();
  return <div id="view">{viewId(view)}</div>;
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  hostViewId = undefined;
  launchParams = undefined;
  hostNavigate.mockClear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const shownView = () => container.querySelector('#view')?.textContent;

describe('a launch into an app the user has opened before', () => {
  it('opens the launched project, not the view the host remembers', () => {
    hostViewId = 'projects';
    launchParams = { projectId: 'hollow-depths' };

    act(() => root.render(<Harness />));

    expect(shownView()).toBe('projects/hollow-depths');
    expect(hostNavigate).toHaveBeenCalledWith('projects/hollow-depths', { replace: true });
    expect(hostNavigate).not.toHaveBeenCalledWith('projects', expect.anything());
  });

  it('opens intake over the remembered project page', () => {
    hostViewId = 'projects/ledger';
    launchParams = { intake: true };

    act(() => root.render(<Harness />));

    expect(shownView()).toBe('projects/new');
    expect(hostNavigate).toHaveBeenCalledWith('projects/new', { replace: true });
  });
});

describe('host back and forward', () => {
  it('still moves the view once the launch has been published', () => {
    hostViewId = 'projects';
    launchParams = { projectId: 'hollow-depths' };
    act(() => root.render(<Harness />));

    // The launch became the current entry, so the shell now reports it back.
    act(() => root.render(<Harness />));
    expect(shownView()).toBe('projects/hollow-depths');

    // Back returns to the list, and the launch no longer overrides it.
    hostViewId = 'projects';
    act(() => root.render(<Harness />));

    expect(shownView()).toBe('projects');
  });

  it('moves the view when there was no launch at all', () => {
    hostViewId = 'projects';
    act(() => root.render(<Harness />));
    expect(shownView()).toBe('projects');

    hostViewId = 'projects/ledger';
    act(() => root.render(<Harness />));

    expect(shownView()).toBe('projects/ledger');
  });
});

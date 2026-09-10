// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import { FIXTURES } from '../__preview__/fixture';
import { SideColumn } from '../components/SideColumn';
import { useDisclosures } from '../lib/page-helpers';

/** Stands in for the host layout service: a profile-wide store that outlives the page. */
const layoutStore: Record<string, string | number | boolean | null> = {};
vi.mock('@sero-ai/app-runtime', () => ({
  openSeroApp: vi.fn(async () => true),
  openSeroFile: vi.fn(async () => true),
  useAppPreferences: () => ({ values: { ...layoutStore }, set: (key: string, value: string | number | boolean | null) => { layoutStore[key] = value; } }),
}));

function Harness() {
  const disclosures = useDisclosures();
  return <SideColumn record={FIXTURES.build!} disclosures={disclosures} />;
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('layout preferences', () => {
  it('keeps history collapsed across a restart through the host layout service', () => {
    act(() => root.render(<Harness />));
    const history = () => container.querySelector<HTMLDetailsElement>('[data-testid="history"]')!;
    expect(history().open).toBe(false);

    // Open it, then collapse it again: the last state is what the host keeps.
    act(() => { history().open = true; history().dispatchEvent(new Event('toggle')); });
    expect(layoutStore.historyOpen).toBe(true);
    act(() => { history().open = false; history().dispatchEvent(new Event('toggle')); });
    expect(layoutStore.historyOpen).toBe(false);

    // A restart is a fresh mount reading the same profile-wide values.
    act(() => root.unmount());
    root = createRoot(container);
    act(() => root.render(<Harness />));
    expect(history().open).toBe(false);

    layoutStore.historyOpen = true;
    act(() => root.unmount());
    root = createRoot(container);
    act(() => root.render(<Harness />));
    expect(history().open).toBe(true);
  });

  it('never touches browser storage', () => {
    const uiDir = path.resolve(__dirname, '..');
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(ts|tsx|css)$/.test(entry.name) && !full.includes('__tests__')) files.push(full);
      }
    };
    walk(uiDir);
    const offenders = files.filter((file) => /localStorage|sessionStorage/.test(fs.readFileSync(file, 'utf8')));
    expect(offenders).toEqual([]);
  });
});

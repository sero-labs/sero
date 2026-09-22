// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import { FIXTURES } from '../__preview__/fixture';
import { HistoryView } from '../components/HistoryView';
import { SideColumn } from '../components/SideColumn';
import { useDisclosures } from '../lib/page-helpers';

/** Stands in for the host layout service: a profile-wide store that outlives the page. */
const layoutStore: Record<string, string | number | boolean | null> = {};
vi.mock('@sero-ai/app-runtime', () => ({
  openSeroApp: vi.fn(async () => true),
  openSeroFile: vi.fn(async () => true),
  useAppPreferences: () => ({ values: { ...layoutStore }, set: (key: string, value: string | number | boolean | null) => { layoutStore[key] = value; } }),
}));

const NOTE = 'A note that folds under its entry.';
const RECORD = {
  ...FIXTURES.build!,
  history: [...FIXTURES.build!.history, { at: '2026-09-19T20:16:00.000Z', phase: 'build' as const, overlay: null, cause: 'You resumed the project', detail: NOTE }],
};

function HistoryHarness() {
  const disclosures = useDisclosures();
  return (
    <HistoryView
      record={RECORD}
      onBack={() => undefined}
      onOpenDispatch={() => undefined}
      onOpenEvidence={() => undefined}
      folds={disclosures.folds}
    />
  );
}

function DirectivesHarness() {
  const disclosures = useDisclosures();
  return <SideColumn record={FIXTURES.build!} disclosures={disclosures} />;
}

let container: HTMLDivElement;
let root: Root;
const remount = (node: React.ReactElement) => {
  act(() => root.unmount());
  root = createRoot(container);
  act(() => root.render(node));
};

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  for (const key of Object.keys(layoutStore)) delete layoutStore[key];
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('layout preferences', () => {
  it('keeps an opened history note open across a restart through the host layout service', () => {
    act(() => root.render(<HistoryHarness />));
    const toggle = () => container.querySelector<HTMLButtonElement>('button[aria-label="Show the note"]')!;
    // Folded by default: the long note is not shown until its own control opens it.
    expect(container.textContent).not.toContain(NOTE);

    act(() => toggle().click());
    // The host layout service keeps the opened note; a fresh mount reads it back.
    expect(layoutStore.historyFolded).toBeTruthy();
    remount(<HistoryHarness />);
    expect(container.textContent).toContain(NOTE);
  });

  it('keeps older directives open across a restart through the host layout service', () => {
    act(() => root.render(<DirectivesHarness />));
    const older = () => container.querySelector<HTMLDetailsElement>('[data-testid="older-directives"]')!;
    expect(older().open).toBe(false);

    act(() => { older().open = true; older().dispatchEvent(new Event('toggle')); });
    expect(layoutStore.olderOpen).toBe(true);

    remount(<DirectivesHarness />);
    expect(older().open).toBe(true);
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

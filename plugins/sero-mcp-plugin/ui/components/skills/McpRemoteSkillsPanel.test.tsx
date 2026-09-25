// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { McpRemoteSkillSummary } from '../../../shared/skills';
import { McpRemoteSkillsPanel } from './McpRemoteSkillsPanel';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const NOW = Date.parse('2026-09-25T12:00:00Z');

function skill(name: string, overrides: Partial<McpRemoteSkillSummary> = {}): McpRemoteSkillSummary {
  return {
    serverName: 'docs',
    uri: `skill://docs/${name}/SKILL.md`,
    name,
    description: `The ${name} skill.`,
    enabled: false,
    changed: false,
    dynamic: false,
    approved: false,
    refreshedAt: new Date(NOW - 5 * 60_000).toISOString(),
    ...overrides,
  };
}

describe('McpRemoteSkillsPanel', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it('shows enabled, disabled and changed skills with their server and URI', async () => {
    const onToggle = vi.fn();
    const skills = [skill('release-notes', { enabled: true }), skill('api-style'), skill('review', { enabled: true, changed: true })];

    await act(async () => root.render(<McpRemoteSkillsPanel skills={skills} onRefresh={vi.fn()} onToggle={onToggle} now={NOW} />));

    expect(container.textContent).toContain('2 of 3 on');
    expect(container.textContent).toContain('Refreshed 5 min ago');
    const rows = [...container.querySelectorAll('li')];
    expect(rows.map((row) => row.querySelector('[role="switch"]')?.getAttribute('aria-checked'))).toEqual(['true', 'false', 'true']);
    expect(rows[0]!.textContent).toContain('skill://docs/release-notes/SKILL.md');
    expect(rows[1]!.textContent).not.toContain('Changed');
    expect(rows[2]!.textContent).toContain('ChangedThe review skill.');
    expect(rows[2]!.textContent).toContain('Sero asks again before this skill runs code.');

    await act(async () => (rows[1]!.querySelector('[role="switch"]') as HTMLButtonElement).click());
    expect(onToggle).toHaveBeenCalledWith(skills[1], true);
  });
});

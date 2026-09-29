// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SkillList } from './SkillList';
import { ALL_PROJECTS, type SkillEntry } from '../lib/skill-catalogue';
import type { SkillView } from '../hooks/useSkillView';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const skill = (over: Partial<SkillEntry>): SkillEntry => ({
  name: 'commit-message',
  description: 'Writes commit messages',
  filePath: `/${over.scope ?? 'user'}/${over.name ?? 'commit-message'}/SKILL.md`,
  scope: 'user',
  origin: 'user',
  disableModelInvocation: false,
  ...over,
});

const projects = [{ id: 'sero', name: 'Sero' }];
const skills = [
  skill({}),
  skill({ name: 'notes', description: 'Take notes' }),
  skill({ scope: 'plugin', origin: 'memory', name: 'recall', description: 'Recall things' }),
  skill({ scope: 'project', origin: 'sero', description: 'Project rule' }),
];

function viewOf(query: string, loses: SkillEntry[] = []): SkillView {
  const shown = skills.filter((s) => `${s.name} ${s.description}`.toLowerCase().includes(query.toLowerCase()));
  return {
    workspace: ALL_PROJECTS,
    setWorkspace: vi.fn(),
    query,
    setQuery: vi.fn(),
    projectNames: new Map(projects.map((p) => [p.id, p.name])),
    inView: skills,
    shown,
    statusFor: (s) => (loses.includes(s) ? { kind: 'loses', by: skills[3] } : null),
    countText: '',
  };
}

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

function render(view: SkillView) {
  act(() => root.render(<SkillList view={view} projects={projects} selected={null} onSelect={vi.fn()} />));
}

const groupButtons = () => [...host.querySelectorAll<HTMLButtonElement>('button[aria-expanded]:not([role="combobox"])')];
const rowNames = () => [...host.querySelectorAll('button[aria-current], button:not([aria-expanded]):not([role="combobox"])')]
  .map((b) => b.querySelector('span')?.textContent).filter(Boolean);

describe('SkillList', () => {
  it('opens Yours and leaves Plugins and projects closed', () => {
    render(viewOf(''));

    expect(groupButtons().map((b) => `${b.textContent}:${b.getAttribute('aria-expanded')}`)).toEqual([
      'Yours2:true',
      'Plugins1:false',
      'Project: Sero1:false',
    ]);
    expect(host.textContent).toContain('notes');
    expect(host.textContent).not.toContain('recall');
  });

  it('opens every group that has a match while searching, and hides the rest', () => {
    render(viewOf('recall'));

    expect(groupButtons().map((b) => b.textContent)).toEqual(['Plugins1']);
    expect(host.textContent).toContain('recall');
  });

  it('marks the skill a chat does not use', () => {
    render(viewOf('', [skills[0]]));

    expect(host.textContent).toContain('Not used');
    expect(rowNames()).toContain('commit-message');
  });
});

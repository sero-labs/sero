// @vitest-environment jsdom

/**
 * The review step is the whole safety of skill extraction: the button drafts,
 * and only the user's edited values are ever saved. A declined pass must read as
 * an ordinary outcome, not as a failure.
 */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@sero-ai/app-runtime', () => ({
  getSeroApi: () => ({
    appState: {
      onChange: () => () => {},
      watch: async () => ({ body: '# From the artifact\n' }),
      unwatch: async () => {},
    },
  }),
}));

import { SkillDraftControl } from '../components/SkillDraftControl';
import type { Loop, SkillDraft } from '../../shared/types';

const DRAFT: SkillDraft = {
  id: 'skill-1',
  createdAt: 't0',
  name: 'lockfile-recovery',
  description: 'Recover a stale lockfile. Use when install fails.',
  bodyRef: '/state/loops/loop-1/artifacts/skill-draft.json',
  fromRunNumbers: [2],
  rationale: 'every run retried the install step',
  status: 'pending',
};

function loopWith(draft?: SkillDraft): Loop {
  return { id: 'loop-1', title: 'Seeded', skillDraft: draft } as unknown as Loop;
}

describe('SkillDraftControl', () => {
  let container: HTMLDivElement;
  let root: Root;

  const render = async (loop: Loop, onDispatch: (p: Record<string, unknown>) => Promise<Record<string, unknown> | null>) => {
    await act(async () => root.render(<SkillDraftControl loop={loop} busy={false} onDispatch={onDispatch} />));
  };
  /** The dialog renders in a portal, so assertions read the whole document. */
  const text = () => document.body.textContent ?? '';
  const trigger = () => container.querySelector('button') as HTMLButtonElement;
  const field = (id: string) => document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement;
  const buttonNamed = (label: string) =>
    [...document.querySelectorAll('button')].find((b) => b.textContent?.includes(label)) as HTMLButtonElement;

  const type = async (id: string, value: string) => {
    const el = field(id);
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    await act(async () => {
      Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };

  beforeEach(() => {
    Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  });

  it('opens the review with the drafted values and saves what the user edited', async () => {
    const dispatch = vi.fn(async (params: Record<string, unknown>) => {
      if (params.action === 'extract_skill') {
        return { ok: true, loop: loopWith(DRAFT), skillDraftBody: '# Drafted body\n' };
      }
      return { ok: true };
    });
    await render(loopWith(), dispatch);
    await act(async () => trigger().click());

    expect(field('skill-name').value).toBe('lockfile-recovery');
    expect(field('skill-body').value).toBe('# Drafted body\n');
    expect(text()).toContain('every run retried the install step');

    await type('skill-name', 'lockfile-fix');
    await type('skill-body', '# Edited\n');
    await act(async () => buttonNamed('Save skill').click());

    expect(dispatch).toHaveBeenLastCalledWith({
      action: 'save_skill',
      loopId: 'loop-1',
      skillName: 'lockfile-fix',
      skillDescription: DRAFT.description,
      skillBody: '# Edited\n',
      skillOverwrite: undefined,
    });
  });

  it('shows a declined pass as a plain line and opens nothing', async () => {
    const dispatch = vi.fn(async () => ({ ok: true, skillDeclined: 'a one-off cleanup' }));
    await render(loopWith(), dispatch);
    await act(async () => trigger().click());

    expect(text()).toContain('Nothing durable to teach yet — a one-off cleanup');
    expect(document.getElementById('skill-name')).toBeNull();
  });

  it('offers to replace only after the name is reported taken', async () => {
    const dispatch = vi.fn(async (params: Record<string, unknown>) => {
      if (params.action === 'extract_skill') return { ok: true, loop: loopWith(DRAFT), skillDraftBody: 'b' };
      if (params.skillOverwrite) return { ok: true };
      return { ok: false, skillConflict: { name: 'lockfile-recovery', filePath: '/x/SKILL.md' } };
    });
    await render(loopWith(), dispatch);
    await act(async () => trigger().click());
    await act(async () => buttonNamed('Save skill').click());

    expect(text()).toContain('already exists');
    await act(async () => buttonNamed('Replace').click());
    expect(dispatch).toHaveBeenLastCalledWith(expect.objectContaining({ skillOverwrite: true }));
  });

  it('reopens a pending draft from its artifact without re-running the pass', async () => {
    const dispatch = vi.fn(async () => ({ ok: true }));
    await render(loopWith(DRAFT), dispatch);

    expect(trigger().textContent).toContain('Review skill');
    await act(async () => trigger().click());

    expect(dispatch).not.toHaveBeenCalled();
    expect(field('skill-body').value).toBe('# From the artifact\n');
  });

  it('discards without writing anything', async () => {
    const dispatch = vi.fn(async () => ({ ok: true }));
    await render(loopWith(DRAFT), dispatch);
    await act(async () => trigger().click());
    await act(async () => buttonNamed('Discard').click());

    expect(dispatch).toHaveBeenCalledWith({ action: 'discard_skill_draft', loopId: 'loop-1' });
  });
});

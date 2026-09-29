// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SkillFileData } from '../components/types';
import { useSkillCrud, type SkillCrud } from './useSkillCrud';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const file = (name: string): SkillFileData => ({
  name,
  description: '',
  extraFrontmatter: {},
  filePath: `/skills/${name}/SKILL.md`,
  body: '',
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((ok, no) => { resolve = ok; reject = no; });
  return { promise, resolve, reject };
}

describe('useSkillCrud selection', () => {
  let container: HTMLDivElement;
  let root: Root;
  let crud: SkillCrud;
  let readSkill: ReturnType<typeof vi.fn>;
  const onError = vi.fn();

  function Probe() {
    crud = useSkillCrud(onError, () => {});
    return null;
  }

  beforeEach(async () => {
    onError.mockClear();
    readSkill = vi.fn();
    (window as Window & { sero?: unknown }).sero = {
      skills: { readSkill, listCatalogue: async () => ({ skills: [], projects: [] }) },
    };
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => root.render(<Probe />));
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it('holds no editor for the new selection until its own file arrives', async () => {
    readSkill.mockResolvedValueOnce(file('a'));
    await act(async () => { await crud.select('/skills/a/SKILL.md'); });
    expect(crud.editing?.name).toBe('a');

    const pending = deferred<SkillFileData>();
    readSkill.mockReturnValueOnce(pending.promise);
    let read!: Promise<void>;
    await act(async () => { read = crud.select('/skills/b/SKILL.md'); });
    // Saving now would write skill a's data over skill b's file.
    expect(crud.selected).toBe('/skills/b/SKILL.md');
    expect(crud.editing).toBeNull();

    await act(async () => { pending.resolve(file('b')); await read; });
    expect(crud.editing?.name).toBe('b');
  });

  it('drops a read that finishes after a newer selection', async () => {
    const slow = deferred<SkillFileData>();
    readSkill.mockReturnValueOnce(slow.promise).mockResolvedValueOnce(file('b'));
    let first!: Promise<void>;
    await act(async () => { first = crud.select('/skills/a/SKILL.md'); });
    await act(async () => { await crud.select('/skills/b/SKILL.md'); });
    await act(async () => { slow.resolve(file('a')); await first; });
    expect(crud.editing?.name).toBe('b');
  });

  it('clears the editor and reports when a read fails', async () => {
    readSkill.mockResolvedValueOnce(file('a')).mockRejectedValueOnce(new Error('denied'));
    await act(async () => { await crud.select('/skills/a/SKILL.md'); });
    await act(async () => { await crud.select('/skills/b/SKILL.md'); });
    expect(crud.editing).toBeNull();
    expect(onError).toHaveBeenCalledWith("Failed to load skill 'b'");
  });
});

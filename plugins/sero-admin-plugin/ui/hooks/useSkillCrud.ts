/**
 * useSkillCrud — encapsulates the skill catalogue + selection + CRUD actions.
 *
 * The catalogue lists every skill a chat could load: yours, plugin skills and
 * each project's own. Selection is keyed by filePath (unique across sources and
 * nested dirs). writeSkill returns the canonical filePath so new skills can be
 * selected immediately after creation.
 */

import { useState, useCallback, useMemo, useRef } from 'react';
import type { SkillFileData } from '../components/types';
import type { SkillEntry } from '../lib/skill-catalogue';
import { getSero } from './host';

const NEW_SKILL: SkillFileData = {
  name: '',
  description: '',
  extraFrontmatter: {},
  body: '',
};

export interface SkillCrud {
  skills: SkillEntry[];
  /** Workspaces that have skills of their own. */
  projects: Array<{ id: string; name: string }>;
  selected: string | null;
  /** The catalogue entry for the selected skill: its scope decides what can be edited. */
  selectedEntry: SkillEntry | null;
  editing: SkillFileData | null;
  isNew: boolean;
  /** Update the editing state (for form field changes). */
  setEditing: (data: SkillFileData | null) => void;
  refresh: () => Promise<void>;
  select: (filePath: string) => Promise<void>;
  startNew: () => void;
  save: (data: SkillFileData) => Promise<void>;
  remove: (filePath: string) => Promise<void>;
}

export function useSkillCrud(
  onError: (msg: string) => void,
  setSaving: (v: boolean) => void,
): SkillCrud {
  const [skills, setSkills] = useState<SkillEntry[]>([]);
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<SkillFileData | null>(null);
  const [isNew, setIsNew] = useState(false);
  const selectedEntry = useMemo(
    () => skills.find((skill) => skill.filePath === selected) ?? null,
    [skills, selected],
  );

  const refresh = useCallback(async () => {
    try {
      const catalogue = await getSero().skills.listCatalogue();
      setSkills(catalogue.skills);
      setProjects(catalogue.projects);
    } catch (err) {
      onError('Failed to load skills');
      console.error('[admin] refreshSkills failed:', err);
    }
  }, [onError]);

  // A read that finishes after a newer selection must not fill the editor with the older skill.
  const latestRead = useRef(0);

  const select = useCallback(async (filePath: string) => {
    const read = ++latestRead.current;
    setSelected(filePath);
    setIsNew(false);
    setEditing(null);
    try {
      const data = await getSero().skills.readSkill(filePath);
      if (read === latestRead.current) setEditing(data);
    } catch (err) {
      if (read !== latestRead.current) return;
      const name = filePath.split('/').at(-2) ?? filePath;
      onError(`Failed to load skill '${name}'`);
    }
  }, [onError]);

  const startNew = useCallback(() => {
    latestRead.current += 1;
    setSelected(null);
    setIsNew(true);
    setEditing({ ...NEW_SKILL, extraFrontmatter: {} });
  }, []);

  const save = useCallback(async (data: SkillFileData) => {
    setSaving(true);
    try {
      const filePath = await getSero().skills.writeSkill(data);
      await refresh();
      setSelected(filePath);
      setIsNew(false);
      setEditing({ ...data, filePath });
    } catch (err) {
      onError(`Failed to save skill '${data.name}'`);
    } finally {
      setSaving(false);
    }
  }, [onError, setSaving, refresh]);

  const remove = useCallback(async (filePath: string) => {
    try {
      await getSero().skills.deleteSkill(filePath);
      if (selected === filePath) {
        setSelected(null);
        setEditing(null);
        setIsNew(false);
      }
      await refresh();
    } catch (err) {
      const name = filePath.split('/').at(-2) ?? filePath;
      onError(`Failed to delete skill '${name}'`);
    }
  }, [selected, onError, refresh]);

  return {
    skills, projects, selected, selectedEntry, editing, isNew, setEditing,
    refresh, select, startNew, save, remove,
  };
}

/**
 * useSkillCrud — encapsulates skill list + selection + CRUD actions.
 *
 * Selection is keyed by filePath (unique across nested dirs).
 * writeSkill returns the canonical filePath so new skills can be
 * selected immediately after creation.
 */

import { useState, useCallback } from 'react';
import type { SkillSummary, SkillFileData, SkillSource } from '../components/types';
import { getSero } from './host';

const NEW_SKILL: SkillFileData = {
  name: '',
  description: '',
  extraFrontmatter: {},
  body: '',
};

export interface SkillCrud {
  skills: SkillSummary[];
  selected: string | null;
  editing: SkillFileData | null;
  isNew: boolean;
  /** Source of the currently selected skill (for delete gating). */
  selectedSource: SkillSource | null;
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
  const [skills, setSkills] = useState<SkillSummary[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<SkillFileData | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [selectedSource, setSelectedSource] = useState<SkillSource | null>(null);

  const refresh = useCallback(async () => {
    try {
      const list = await getSero().skills.listSkills();
      setSkills(list);
    } catch (err) {
      onError('Failed to load skills');
      console.error('[admin] refreshSkills failed:', err);
    }
  }, [onError]);

  const select = useCallback(async (filePath: string) => {
    try {
      setSelected(filePath);
      setIsNew(false);
      // Look up source from the skills list
      const summary = skills.find((s) => s.filePath === filePath);
      setSelectedSource(summary?.source ?? null);
      const data = await getSero().skills.readSkill(filePath);
      setEditing(data);
    } catch (err) {
      const name = filePath.split('/').at(-2) ?? filePath;
      onError(`Failed to load skill '${name}'`);
    }
  }, [skills, onError]);

  const startNew = useCallback(() => {
    setSelected(null);
    setIsNew(true);
    setSelectedSource('user');
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
      setSelectedSource('user');
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
        setSelectedSource(null);
      }
      await refresh();
    } catch (err) {
      const name = filePath.split('/').at(-2) ?? filePath;
      onError(`Failed to delete skill '${name}'`);
    }
  }, [selected, onError, refresh]);

  return {
    skills, selected, editing, isNew, selectedSource, setEditing,
    refresh, select, startNew, save, remove,
  };
}

/**
 * usePromptCrud — encapsulates prompt template list + selection + CRUD.
 *
 * Selection is keyed by filePath (unique across the prompts tree).
 * writePrompt returns the canonical filePath so new templates can
 * be selected immediately after creation.
 */

import { useState, useCallback } from 'react';
import type { PromptTemplateSummary, PromptTemplateFileData } from '../components/types';

const NEW_PROMPT: PromptTemplateFileData = {
  name: '',
  description: '',
  body: '',
};

export interface PromptCrud {
  prompts: PromptTemplateSummary[];
  selected: string | null;
  editing: PromptTemplateFileData | null;
  isNew: boolean;
  /** Update the editing state (for form field changes). */
  setEditing: (data: PromptTemplateFileData | null) => void;
  refresh: () => Promise<void>;
  select: (filePath: string) => Promise<void>;
  startNew: () => void;
  save: (data: PromptTemplateFileData) => Promise<void>;
  remove: (filePath: string) => Promise<void>;
}

export function usePromptCrud(
  onError: (msg: string) => void,
  setSaving: (v: boolean) => void,
): PromptCrud {
  const [prompts, setPrompts] = useState<PromptTemplateSummary[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<PromptTemplateFileData | null>(null);
  const [isNew, setIsNew] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const list = await window.sero.prompts.listPrompts();
      setPrompts(list);
    } catch (err) {
      onError('Failed to load prompt templates');
      console.error('[resources-app] refreshPrompts failed:', err);
    }
  }, [onError]);

  const select = useCallback(async (filePath: string) => {
    try {
      setSelected(filePath);
      setIsNew(false);
      const data = await window.sero.prompts.readPrompt(filePath);
      setEditing(data);
    } catch (err) {
      const name = filePath.split('/').pop() ?? filePath;
      onError(`Failed to load prompt '${name}'`);
    }
  }, [onError]);

  const startNew = useCallback(() => {
    setSelected(null);
    setIsNew(true);
    setEditing({ ...NEW_PROMPT });
  }, []);

  const save = useCallback(async (data: PromptTemplateFileData) => {
    setSaving(true);
    try {
      const filePath = await window.sero.prompts.writePrompt(data);
      await refresh();
      setSelected(filePath);
      setIsNew(false);
      setEditing({ ...data, filePath });
    } catch (err) {
      onError(`Failed to save prompt '${data.name}'`);
    } finally {
      setSaving(false);
    }
  }, [onError, setSaving, refresh]);

  const remove = useCallback(async (filePath: string) => {
    try {
      await window.sero.prompts.deletePrompt(filePath);
      if (selected === filePath) {
        setSelected(null);
        setEditing(null);
        setIsNew(false);
      }
      await refresh();
    } catch (err) {
      const name = filePath.split('/').pop() ?? filePath;
      onError(`Failed to delete prompt '${name}'`);
    }
  }, [selected, onError, refresh]);

  return {
    prompts, selected, editing, isNew, setEditing,
    refresh, select, startNew, save, remove,
  };
}

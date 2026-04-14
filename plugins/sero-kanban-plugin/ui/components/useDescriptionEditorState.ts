import { useAI } from '@sero-ai/app-runtime';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { Card, KanbanState } from '../../shared/types';

const ENHANCE_PROMPT_PREFIX =
  'Improve the following task description for a kanban board card titled';
const ENHANCE_PROMPT_SUFFIX =
  'Make it clearer, more specific, and better written. '
  + 'Keep it concise — a short paragraph at most. '
  + "Don't turn it into a full specification, don't add headers or bullet points. "
  + 'Return only the improved description text, nothing else.';

interface UseDescriptionEditorStateOptions {
  card: Card;
  onUpdate: (updater: (state: KanbanState) => KanbanState) => void;
}

export function useDescriptionEditorState({
  card,
  onUpdate,
}: UseDescriptionEditorStateOptions) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(card.description);
  const [enhancing, setEnhancing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const ai = useAI();

  useEffect(() => {
    if (!editing) {
      setDraft(card.description);
    }
  }, [card.description, editing]);

  useEffect(() => {
    if (!editing || !textareaRef.current) {
      return;
    }
    const element = textareaRef.current;
    element.style.height = 'auto';
    element.style.height = `${element.scrollHeight}px`;
  }, [draft, editing]);

  const saveDescription = useCallback((text: string) => {
    onUpdate((prev) => ({
      ...prev,
      cards: prev.cards.map((candidate) => (
        candidate.id === card.id
          ? { ...candidate, description: text, updatedAt: new Date().toISOString() }
          : candidate
      )),
    }));
  }, [card.id, onUpdate]);

  const handleStartEdit = useCallback(() => {
    setDraft(card.description);
    setEditing(true);
    requestAnimationFrame(() => {
      if (!textareaRef.current) {
        return;
      }
      textareaRef.current.focus();
      const length = textareaRef.current.value.length;
      textareaRef.current.setSelectionRange(length, length);
    });
  }, [card.description]);

  const handleSave = useCallback(() => {
    saveDescription(draft);
    setEditing(false);
  }, [draft, saveDescription]);

  const commitDraft = useCallback(() => {
    const nextDraft = editing ? draft : card.description;
    if (editing) {
      saveDescription(nextDraft);
      setEditing(false);
    }
    return nextDraft;
  }, [card.description, draft, editing, saveDescription]);

  const handleCancel = useCallback(() => {
    setDraft(card.description);
    setEditing(false);
  }, [card.description]);

  const handleEnhance = useCallback(async () => {
    const text = draft.trim();
    if (!text) {
      return;
    }

    setEnhancing(true);
    try {
      const enhanced = await ai.prompt(
        `${ENHANCE_PROMPT_PREFIX} "${card.title}". ${ENHANCE_PROMPT_SUFFIX}\n\n${text}`,
      );
      setDraft(enhanced.trim());
    } catch (error) {
      console.error('[DescriptionEditor] enhance failed:', error);
    } finally {
      setEnhancing(false);
    }
  }, [ai, card.title, draft]);

  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      handleCancel();
    }
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      handleSave();
    }
  }, [handleCancel, handleSave]);

  return {
    editing,
    draft,
    enhancing,
    textareaRef,
    setDraft,
    handleStartEdit,
    handleSave,
    handleCancel,
    handleEnhance,
    handleKeyDown,
    commitDraft,
  };
}

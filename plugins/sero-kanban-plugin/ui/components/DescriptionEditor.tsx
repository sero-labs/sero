/**
 * DescriptionEditor — editable description block with AI enhancement.
 *
 * Shows card description with inline edit mode. The "Enhance" button
 * uses useAI to improve the text — making it clearer and more specific
 * without turning it into a full specification.
 */

import { forwardRef, useImperativeHandle } from 'react';
import { AnimatePresence, motion } from 'motion/react';

import type { Card, KanbanState } from '../../shared/types';
import { useDescriptionEditorState } from './useDescriptionEditorState';

export interface DescriptionEditorHandle {
  commitDraft: () => string;
}

export const DescriptionEditor = forwardRef<DescriptionEditorHandle, {
  card: Card;
  onUpdate: (updater: (state: KanbanState) => KanbanState) => void;
}>(function DescriptionEditor({
  card,
  onUpdate,
}, ref) {
  const {
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
  } = useDescriptionEditorState({ card, onUpdate });

  useImperativeHandle(ref, () => ({ commitDraft }), [commitDraft]);

  return (
    <div style={{ marginBottom: '20px' }}>
      <div className="flex items-center justify-between" style={{ marginBottom: '8px' }}>
        <h3
          style={{
            fontSize: '11px',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: '#5c5e6a',
          }}
        >
          Description
        </h3>
        {!editing && (
          <button
            onClick={handleStartEdit}
            className="flex items-center gap-1 rounded-md transition-colors hover:text-[#8b8d97]"
            style={{ padding: '2px 6px', fontSize: '10px', color: '#5c5e6a' }}
          >
            <EditIcon />
            Edit
          </button>
        )}
      </div>

      <AnimatePresence mode="wait">
        {editing ? (
          <EditMode
            key="editor"
            draft={draft}
            enhancing={enhancing}
            textareaRef={textareaRef}
            onDraftChange={setDraft}
            onKeyDown={handleKeyDown}
            onEnhance={handleEnhance}
            onSave={handleSave}
            onCancel={handleCancel}
          />
        ) : (
          <DisplayMode
            key="display"
            description={card.description}
            onStartEdit={handleStartEdit}
          />
        )}
      </AnimatePresence>
    </div>
  );
});

function EditMode({
  draft,
  enhancing,
  textareaRef,
  onDraftChange,
  onKeyDown,
  onEnhance,
  onSave,
  onCancel,
}: {
  draft: string;
  enhancing: boolean;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  onDraftChange: (value: string) => void;
  onKeyDown: (event: React.KeyboardEvent) => void;
  onEnhance: () => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.12 }}
    >
      <textarea
        ref={textareaRef}
        value={draft}
        onChange={(event) => onDraftChange(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Describe the task…"
        rows={3}
        style={{
          width: '100%',
          resize: 'none',
          overflow: 'hidden',
          borderRadius: '6px',
          border: '1px solid rgba(129, 140, 248, 0.3)',
          backgroundColor: '#22252f',
          padding: '10px 12px',
          fontSize: '13px',
          lineHeight: '1.5',
          color: '#e8e4df',
          outline: 'none',
          fontFamily: 'inherit',
        }}
      />

      <div className="flex items-center justify-between" style={{ marginTop: '8px' }}>
        <EnhanceButton
          disabled={enhancing || !draft.trim()}
          loading={enhancing}
          onClick={onEnhance}
        />
        <div className="flex" style={{ gap: '4px' }}>
          <button
            onClick={onCancel}
            disabled={enhancing}
            className="rounded-md transition-colors"
            style={{ padding: '5px 10px', fontSize: '11px', color: '#5c5e6a' }}
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={enhancing}
            className="rounded-md transition-colors"
            style={{
              padding: '5px 10px',
              fontSize: '11px',
              fontWeight: 500,
              backgroundColor: 'rgba(129, 140, 248, 0.15)',
              color: '#818cf8',
            }}
          >
            Save
          </button>
        </div>
      </div>

      <p style={{ fontSize: '10px', color: '#5c5e6a', marginTop: '6px' }}>
        ⌘Enter to save · Esc to cancel
      </p>
    </motion.div>
  );
}

function DisplayMode({
  description,
  onStartEdit,
}: {
  description: string;
  onStartEdit: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.12 }}
    >
      {description ? (
        <p
          className="cursor-pointer rounded-md px-0 py-1 text-sm leading-relaxed transition-colors hover:bg-white/[0.03]"
          style={{ color: '#8b8d97' }}
          onClick={onStartEdit}
        >
          {description}
        </p>
      ) : (
        <button
          onClick={onStartEdit}
          className="w-full rounded-md border border-dashed text-left transition-colors hover:border-[#818cf8]/30 hover:text-[#8b8d97]"
          style={{
            padding: '10px 12px',
            borderColor: 'rgba(255, 255, 255, 0.08)',
            color: '#5c5e6a',
            fontSize: '12px',
          }}
        >
          + Add a description…
        </button>
      )}
    </motion.div>
  );
}

function EnhanceButton({
  disabled,
  loading,
  onClick,
}: {
  disabled: boolean;
  loading: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-1.5 rounded-md transition-all"
      style={{
        padding: '5px 10px',
        fontSize: '11px',
        fontWeight: 500,
        border: '1px solid rgba(129, 140, 248, 0.2)',
        backgroundColor: loading ? 'rgba(129, 140, 248, 0.08)' : 'transparent',
        color: loading ? '#a5b4fc' : '#818cf8',
        opacity: disabled && !loading ? 0.4 : 1,
        cursor: disabled ? 'default' : 'pointer',
      }}
    >
      {loading ? (
        <>
          <Spinner />
          Enhancing…
        </>
      ) : (
        <>
          <SparkleIcon />
          Enhance
        </>
      )}
    </button>
  );
}

function EditIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"
      />
    </svg>
  );
}

function SparkleIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
      />
    </svg>
  );
}

function Spinner() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" className="animate-spin">
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth={2}
        strokeDasharray="31.4 31.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

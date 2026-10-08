import { useState, type RefObject } from 'react';
import { Button } from '@sero-ai/ui';
import { Send } from 'lucide-react';

import type { ActionOutcome } from '../lib/actions';

export interface DirectiveComposerProps {
  disabled: boolean;
  onSend(text: string): Promise<ActionOutcome>;
  /** A flagged Architect project can turn this request into another OpenSpec change. */
  onRequestChange?(text: string): Promise<ActionOutcome>;
  /**
   * Focused by "Tell Architect what to do next" in the project header. That
   * control is a way into this box, not a second way to send a directive.
   */
  inputRef?: RefObject<HTMLTextAreaElement | null>;
  /** Text the box starts with, when the user opened it from a decision. */
  initialDraft?: string;
  /** Put the cursor in the box when it appears. */
  autoFocus?: boolean;
}

export function DirectiveComposer({ disabled: phaseDisabled, onSend, onRequestChange, inputRef, initialDraft = '', autoFocus = false }: DirectiveComposerProps) {
  const [draft, setDraft] = useState(initialDraft);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const disabled = phaseDisabled || busy;

  const send = async (submit: (text: string) => Promise<ActionOutcome>) => {
    const text = draft.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    try {
      const outcome = await submit(text);
      if (outcome.ok) setDraft('');
      else setError(outcome.text);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <form
        className="ar-composer"
        onSubmit={(event) => {
          event.preventDefault();
          void send(onSend);
        }}
      >
        <textarea
          ref={inputRef}
          rows={1}
          autoFocus={autoFocus}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) void send(onSend);
          }}
          placeholder="Tell Architect something, or ask it a question"
          aria-label="Note to Architect"
          disabled={disabled}
        />
        <Button type="submit" size="sm" className="ar-btn ar-btn-primary" disabled={disabled || !draft.trim()}><Send className="ar-i" />Send</Button>
        {onRequestChange && <Button type="button" size="sm" variant="outline" disabled={disabled || !draft.trim()} onClick={() => void send(onRequestChange)}>Start OpenSpec change</Button>}
      </form>
      {error && <p className="ar-error">{error}</p>}
    </div>
  );
}

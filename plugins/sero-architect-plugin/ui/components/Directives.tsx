import { useState, type RefObject } from 'react';
import { Button } from '@sero-ai/ui';
import { Compass, Send } from 'lucide-react';

import type { ProjectRecord } from '../../shared/record';
import type { ActionOutcome } from '../lib/actions';
import { shortTime } from '../lib/format';
import { directiveThread } from '../lib/view-model';
import { Quiet, SectionHead } from './Pill';

export interface DirectivesProps {
  record: ProjectRecord;
}

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
}

/** The latest directive and its reply. Saved directives are unchanged. */
export function Directives({ record }: DirectivesProps) {
  const { latest } = directiveThread(record);

  return (
    <section aria-labelledby="ar-dir-h">
      <SectionHead id="ar-dir-h" title="Directive" count="latest reply" />
      {latest && (
        <div className="ar-you"><small>you · {shortTime(latest.sentAt)}</small><p>{latest.text}</p></div>
      )}
      {latest?.reply ? (
        <div className="ar-reply">
          <span className="ar-av"><Compass className="ar-i" /></span>
          <div className="ar-rt"><small>architect · {shortTime(latest.reply.repliedAt)}</small><p>{latest.reply.text}</p></div>
        </div>
      ) : latest ? (
        <div className="ar-reply">
          <span className="ar-av"><Compass className="ar-i" /></span>
          <div className="ar-rt"><small>architect · replying</small><p>Architect will reply here. Current work continues.</p></div>
        </div>
      ) : (
        <Quiet>No directive sent yet.</Quiet>
      )}
    </section>
  );
}

export function DirectiveComposer({ disabled: phaseDisabled, onSend, onRequestChange, inputRef }: DirectiveComposerProps) {
  const [draft, setDraft] = useState('');
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
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) void send(onSend);
          }}
          placeholder="Send an instruction or update."
          aria-label="Directive"
          disabled={disabled}
        />
        <Button type="submit" size="sm" className="ar-btn ar-btn-primary" disabled={disabled || !draft.trim()}><Send className="ar-i" />Send</Button>
        {onRequestChange && <Button type="button" size="sm" variant="outline" disabled={disabled || !draft.trim()} onClick={() => void send(onRequestChange)}>Start OpenSpec change</Button>}
      </form>
      {error && <p className="ar-error">{error}</p>}
    </div>
  );
}

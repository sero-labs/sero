import { useState, type ComponentType } from 'react';
import { Button } from '@sero-ai/ui';
import { Clock, Hand, Pause, Play } from 'lucide-react';

import type { ProjectRecord } from '../../shared/record';
import type { ArchitectActions } from '../lib/actions';
import { waitCard, type WaitCardKind } from '../lib/wait-status';

const ICON: Record<WaitCardKind, { Icon: ComponentType<{ className?: string }>; tone: string }> = {
  waiting: { Icon: Clock, tone: 'attention' },
  working: { Icon: Play, tone: 'live' },
  'on-hold': { Icon: Pause, tone: 'attention' },
  manual: { Icon: Hand, tone: 'armed' },
};

/**
 * What the project is waiting for, how long it has worked and waited, and the
 * one way to carry on when only the user can. It reads the record and nothing
 * else, so a late event cannot make a held project look finished.
 */
export function WaitCard({ record, actions }: { record: ProjectRecord; actions: ArchitectActions }) {
  const [refusal, setRefusal] = useState<string | null>(null);
  const card = waitCard(record, Date.now());
  if (!card) return null;
  const { Icon, tone } = ICON[card.kind];
  const resume = async () => {
    const result = await actions.resume(record.id);
    setRefusal(result.ok ? null : result.text);
  };
  return (
    <section className="ar-stateline ar-waitcard" aria-label="Wait" data-wait={card.kind}>
      <div className="ar-stateline-main">
        <h2 className="ar-sentence">{record.name}</h2>
        <div className="ar-activity-state ar-wait-word">
          <span className="ar-gchip" data-tone={tone} aria-hidden="true"><Icon className="ar-gi" /></span>
          <span>{card.word}</span>
        </div>
        <dl className="ar-facts">
          {card.rows.map((row) => (
            <div className="ar-fact" key={row.label}><dt>{row.label}</dt><dd>{row.value}</dd></div>
          ))}
        </dl>
        {card.canResume && (
          <div className="ar-act-row">
            <Button type="button" className="ar-btn ar-btn-solid" onClick={() => void resume()}>Resume work</Button>
          </div>
        )}
        {refusal && <p className="ar-error" role="alert">{refusal}</p>}
      </div>
    </section>
  );
}

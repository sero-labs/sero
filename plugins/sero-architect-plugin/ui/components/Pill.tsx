import type { ReactNode } from 'react';

import type { PillTone } from '../lib/format';

/** The uppercase status pill. Amber is a border and text only, never a wash. */
export function Pill({ tone = 'plain', children }: { tone?: PillTone; children: ReactNode }) {
  return <span className="ar-pill" data-tone={tone}>{children}</span>;
}

export function SectionHead({ title, count, warn = false, id }: { title: string; count: string; warn?: boolean; id?: string }) {
  return (
    <div className="ar-sec-head" id={id}>
      <span className={warn ? 'ar-warn-text' : undefined}>{title}</span>
      <span className="ar-n">{count}</span>
    </div>
  );
}

export function Quiet({ tone = 'plain', children }: { tone?: 'ok' | 'plain'; children: ReactNode }) {
  return <div className="ar-quiet"><span className="ar-dot" data-tone={tone} />{children}</div>;
}

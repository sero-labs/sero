/**
 * QuickReference — collapsible panel showing key context management
 * concepts from the SKILL.md (the loop, tools, tag naming, decisions).
 */

import { useState } from 'react';
import { cn } from '@sero/ui/lib/utils';
import {
  QUICK_START_LOOP,
  TOOL_REFERENCE,
  TAG_NAMING,
  DECISION_MATRIX,
} from '../../shared/skill-reference';

export function QuickReference() {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
      >
        <span
          className={cn(
            'inline-block text-[10px] transition-transform',
            open && 'rotate-90',
          )}
        >
          ▶
        </span>
        Quick Reference
      </button>

      {open && (
        <div className="mt-3 flex flex-col gap-5 animate-fade-in-up">
          {/* The Loop */}
          <Section title="The Core Loop">
            <div className="flex flex-col gap-1">
              {QUICK_START_LOOP.map((item) => (
                <div key={item.step} className="flex gap-2 text-xs">
                  <span className="shrink-0 font-mono text-indigo-400">
                    {item.step}
                  </span>
                  <span className="text-muted-foreground">{item.desc}</span>
                </div>
              ))}
            </div>
          </Section>

          {/* Tool Reference */}
          <Section title="Tools">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-muted-foreground/60">
                  <th className="pb-1 pr-2 font-normal">Tool</th>
                  <th className="pb-1 pr-2 font-normal">≈</th>
                  <th className="pb-1 font-normal">When</th>
                </tr>
              </thead>
              <tbody>
                {TOOL_REFERENCE.map((t) => (
                  <tr key={t.tool}>
                    <td className="py-0.5 pr-2 font-mono text-foreground">
                      {t.tool}
                    </td>
                    <td className="py-0.5 pr-2 text-muted-foreground">
                      {t.analog}
                    </td>
                    <td className="py-0.5 text-muted-foreground">{t.when}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>

          {/* Tag Naming */}
          <Section title="Tag Naming">
            <div className="flex flex-wrap gap-1.5">
              {TAG_NAMING.map((t) => (
                <div
                  key={t.category}
                  className="rounded-md border border-border px-2 py-1"
                >
                  <span className="text-[10px] text-muted-foreground">
                    {t.category}:{' '}
                  </span>
                  <span className="font-mono text-[10px] text-foreground">
                    {t.example}
                  </span>
                </div>
              ))}
            </div>
          </Section>

          {/* Decision Matrix */}
          <Section title="When to Act">
            <table className="w-full text-xs">
              <tbody>
                {DECISION_MATRIX.map((d) => (
                  <tr key={d.situation} className="border-b border-border/30 last:border-0">
                    <td className="py-1 pr-2 text-foreground">{d.situation}</td>
                    <td className="py-1 pr-2 font-mono text-indigo-400 text-[10px]">
                      {d.action}
                    </td>
                    <td className="py-1 text-muted-foreground">{d.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        </div>
      )}
    </div>
  );
}

// ── Section wrapper ───────────────────────────────────────────

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <h3 className="text-[11px] font-medium text-foreground">{title}</h3>
      {children}
    </div>
  );
}

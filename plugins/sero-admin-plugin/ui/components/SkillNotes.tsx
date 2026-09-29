/**
 * SkillNotes, the notes above a skill's fields: who owns it, and whether another
 * skill with the same name takes its place.
 */

import { Info } from 'lucide-react';
import { cn } from '@sero-ai/ui/lib/utils';
import type { SkillScopeIPC } from '../hooks/host';

interface SkillNotesProps {
  scope: SkillScopeIPC;
  /** A plugin's short name or a project's name. */
  originName: string;
  duplicate: { lead: string; text: string } | null;
}

export function SkillNotes({ scope, originName, duplicate }: SkillNotesProps) {
  return (
    <>
      {scope === 'plugin' && (
        <Note>
          <b>Read only.</b> This skill comes from the <b>{originName}</b> plugin. To change it, change the plugin. Every chat can use it.
        </Note>
      )}
      {scope === 'project' && (
        <Note>
          <b>Project skill.</b> This skill lives in the <b>{originName}</b> project, in <code>.agents/skills</code>. Saving changes the file in that project, so a git repo will show it as a change. Only chats in that project can use it.
        </Note>
      )}
      {duplicate && (
        <Note warn>
          <b>{duplicate.lead}</b> {duplicate.text}
        </Note>
      )}
    </>
  );
}

function Note({ warn, children }: { warn?: boolean; children: React.ReactNode }) {
  return (
    <div className={cn(
      'flex items-start gap-2 border-b border-border px-4 py-2.5 text-sm leading-snug text-muted-foreground',
      warn ? 'bg-amber-500/10' : 'bg-card/70',
    )}>
      <Info className={cn('mt-0.5 size-3.5 shrink-0', warn && 'text-amber-400')} />
      <span className="[&_b]:font-medium [&_b]:text-foreground">{children}</span>
    </div>
  );
}

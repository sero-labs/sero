/**
 * SkillList, the left panel of the Skills page.
 *
 * Skills are grouped by where they come from: Yours, Plugins and one group per
 * project. Groups are collapsible. A search opens every group that has a match.
 * When two skills share a name, the one a chat does not use is marked "Not used".
 *
 * Selection is keyed by filePath (unique), not name, because names repeat
 * across sources.
 */

import { memo, useState } from 'react';
import { ChevronRight, Search } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@sero-ai/ui/components/ui/select';
import { cn } from '@sero-ai/ui/lib/utils';
import type { SkillView } from '../hooks/useSkillView';
import { ALL_PROJECTS, groupSkills, skillKey, type SkillEntry } from '../lib/skill-catalogue';

interface SkillListProps {
  view: SkillView;
  projects: Array<{ id: string; name: string }>;
  /** Currently selected filePath. */
  selected: string | null;
  /** Called with the skill's filePath. */
  onSelect: (filePath: string) => void;
}

/** Yours is open at first. Plugins and projects wait to be opened. */
const OPEN_AT_FIRST = new Set(['user']);

export const SkillList = memo(function SkillList({ view, projects, selected, onSelect }: SkillListProps) {
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const searching = view.query.trim().length > 0;

  const groups = groupSkills(view.shown, projects, view.workspace).filter(
    (group) => !searching || group.skills.length > 0,
  );

  const isOpen = (key: string, skills: SkillEntry[]) =>
    searching
    || (openGroups[key] ?? (OPEN_AT_FIRST.has(key) || skills.some((skill) => skillKey(skill) === selected)));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-col gap-2 border-b border-border/30 px-3 py-2">
        {projects.length > 0 && (
          <Select value={view.workspace} onValueChange={view.setWorkspace}>
            <SelectTrigger size="sm" className="w-full" aria-label="Project skills from">
              <span className="text-muted-foreground">Project skills from</span>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_PROJECTS}>All projects</SelectItem>
              {projects.map((project) => (
                <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <label className="flex h-8 items-center gap-1.5 rounded-md border border-border/50 bg-muted/30 px-2 text-muted-foreground focus-within:border-ring">
          <Search className="size-3.5 shrink-0" />
          <input
            type="search"
            value={view.query}
            onChange={(event) => view.setQuery(event.target.value)}
            placeholder="Search skills"
            aria-label="Search skills"
            className="min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
          />
        </label>
      </div>

      <div className="flex-1 overflow-y-auto">
        {groups.length === 0 ? (
          <EmptyList query={view.query.trim()} />
        ) : groups.map((group) => {
          const open = isOpen(group.key, group.skills);
          return (
            <div key={group.key}>
              <button
                type="button"
                aria-expanded={open}
                onClick={() => setOpenGroups((current) => ({ ...current, [group.key]: !open }))}
                className="flex w-full items-center gap-1.5 border-b border-border/50 bg-card px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:bg-secondary/50"
              >
                <ChevronRight className={cn('size-3.5 shrink-0 transition-transform', open && 'rotate-90')} />
                <span className="min-w-0 truncate">{group.label}</span>
                <span className="ml-auto font-normal">{group.skills.length}</span>
              </button>
              {open && group.skills.map((skill) => (
                <SkillRow
                  key={skillKey(skill)}
                  skill={skill}
                  unused={view.statusFor(skill)?.kind === 'loses'}
                  selected={selected === skillKey(skill)}
                  onSelect={onSelect}
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
});

function SkillRow({ skill, unused, selected, onSelect }: {
  skill: SkillEntry;
  unused: boolean;
  selected: boolean;
  onSelect: (filePath: string) => void;
}) {
  // A project group already names the project, so its rows carry no tag.
  const tag = unused ? 'Not used' : skill.scope === 'plugin' ? skill.origin : '';
  return (
    <button
      type="button"
      onClick={() => onSelect(skill.filePath)}
      aria-current={selected ? 'true' : undefined}
      className={cn(
        'flex w-full min-w-0 flex-col gap-0.5 overflow-hidden border-b border-border/50 px-3 py-2.5 text-left transition-colors',
        'hover:bg-secondary/50',
        selected && 'bg-secondary border-l-2 border-l-primary',
      )}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <span className={cn(
          'min-w-0 flex-1 truncate text-base font-medium text-foreground',
          unused && 'text-muted-foreground line-through decoration-border',
        )}>
          {skill.name}
        </span>
        {tag && (
          <span className={cn(
            'max-w-36 shrink-0 truncate rounded bg-muted px-1 py-px text-xs text-muted-foreground',
            unused && 'bg-amber-500/15 text-amber-400',
          )}>
            {tag}
          </span>
        )}
      </div>
      <p className={cn('w-full truncate text-sm leading-snug text-muted-foreground', unused && 'line-through decoration-border')}>
        {skill.description || 'No description'}
      </p>
    </button>
  );
}

function EmptyList({ query }: { query: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center p-4 text-center">
      <p className="text-sm text-muted-foreground">
        {query ? `No skills match "${query}"` : 'No skills found'}
      </p>
      <p className="mt-1 text-sm text-muted-foreground/60">
        {query ? 'Try a different word, or choose All projects.' : 'Click + to create one'}
      </p>
    </div>
  );
}

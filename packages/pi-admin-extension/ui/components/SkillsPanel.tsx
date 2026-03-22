import { memo, useMemo, useState } from 'react';
import { Input } from '@sero/ui/components/ui/input';
import { ScrollArea } from '@sero/ui/components/ui/scroll-area';
import { Switch } from '@sero/ui/components/ui/switch';
import { useSkillVisibility } from '../hooks/useSkillVisibility';

interface SkillsPanelProps {
  profilePath: string | null;
}

export const SkillsPanel = memo(function SkillsPanel({ profilePath }: SkillsPanelProps) {
  const { skills, loading, saving, error, setSkillEnabled } = useSkillVisibility(profilePath);
  const [query, setQuery] = useState('');

  const filteredSkills = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return skills;
    return skills.filter((skill) => (
      skill.name.toLowerCase().includes(needle) ||
      skill.description.toLowerCase().includes(needle) ||
      formatSourceLabel(skill.source).toLowerCase().includes(needle)
    ));
  }, [query, skills]);

  if (!profilePath) {
    return <EmptyState message="No active profile available." />;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="border-b border-border/30 px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h2 className="text-sm font-medium text-foreground/85">Skill Visibility</h2>
            <p className="max-w-3xl text-[11px] leading-5 text-muted-foreground/75">
              Hide skills you rarely need. Hidden skills still work with <code>/skill:name</code>.
              Changes save automatically.
            </p>
          </div>
          {saving && (
            <span className="pt-0.5 text-[11px] text-muted-foreground/60">Saving…</span>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter skills…"
            className="h-8 max-w-sm text-xs"
          />
          <span className="text-[11px] text-muted-foreground/60">
            {filteredSkills.length} shown
          </span>
        </div>
      </div>

      {error && (
        <div className="border-b border-destructive/20 bg-destructive/5 px-4 py-2">
          <p className="text-[11px] text-destructive">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="flex h-full items-center justify-center">
          <div className="admin-loading text-xs text-muted-foreground">Loading skills…</div>
        </div>
      ) : filteredSkills.length === 0 ? (
        <EmptyState message={query ? 'No skills match this filter.' : 'No skills available.'} />
      ) : (
        <ScrollArea className="min-h-0 flex-1">
          <div className="divide-y divide-border/20">
            {filteredSkills.map((skill) => (
              <SkillRow
                key={skill.name}
                name={skill.name}
                description={skill.description}
                source={skill.source}
                visibleToModel={skill.visibleToModel}
                lockedHidden={skill.lockedHidden}
                onVisibleChange={(visible) => setSkillEnabled(skill.name, visible)}
              />
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
});

function SkillRow({
  name,
  description,
  source,
  visibleToModel,
  lockedHidden,
  onVisibleChange,
}: {
  name: string;
  description: string;
  source: string;
  visibleToModel: boolean;
  lockedHidden: boolean;
  onVisibleChange: (visible: boolean) => void;
}) {
  return (
    <div className="px-4 py-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-xs font-medium text-foreground/90">{name}</h3>
            {lockedHidden && (
              <span className="text-[10px] text-muted-foreground/55">Explicit only</span>
            )}
          </div>
          <p className="text-[11px] leading-5 text-muted-foreground/75">{description}</p>
          <p className="text-[10px] text-muted-foreground/50">{formatSourceLabel(source)}</p>
        </div>

        <div className="shrink-0 pt-0.5">
          <Switch
            checked={visibleToModel}
            disabled={lockedHidden}
            onCheckedChange={onVisibleChange}
            aria-label={`Toggle automatic model invocation for ${name}`}
            className="data-[state=checked]:bg-[var(--status-success)]"
          />
        </div>
      </div>
    </div>
  );
}

function formatSourceLabel(source: string): string {
  if (!source.includes('/') && !source.includes('\\')) return source;

  const parts = source.split(/[\\/]/).filter(Boolean);
  const last = parts.at(-1) ?? source;
  return last.endsWith('.md') && parts.length > 1 ? (parts.at(-2) ?? last) : last;
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/10">
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-indigo-400/60"
        >
          <path d="M12 3v18" />
          <path d="M7 8.5h6a3.5 3.5 0 1 0 0-7H9" />
          <path d="M7 15.5h8a3.5 3.5 0 1 1 0 7H9" />
        </svg>
      </div>
      <p className="mt-3 text-xs text-muted-foreground/55">{message}</p>
    </div>
  );
}

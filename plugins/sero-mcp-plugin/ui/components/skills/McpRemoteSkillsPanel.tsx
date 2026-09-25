import { Badge } from '@sero-ai/ui/components/ui/badge';
import { Button } from '@sero-ai/ui/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@sero-ai/ui/components/ui/card';
import { Switch } from '@sero-ai/ui/components/ui/switch';
import { cn } from '@sero-ai/ui/lib/utils';
import { BookOpen, RefreshCw } from 'lucide-react';
import type { McpRemoteSkillSummary } from '../../../shared/skills';

export interface McpRemoteSkillsPanelProps {
  skills: McpRemoteSkillSummary[];
  error?: string | null;
  refreshing?: boolean;
  onRefresh: () => void;
  onToggle: (skill: McpRemoteSkillSummary, enabled: boolean) => void;
  now?: number;
}

/** Skills that MCP servers serve, as the approved prototype shows them. New skills start off. */
export function McpRemoteSkillsPanel({ skills, error, refreshing, onRefresh, onToggle, now = Date.now() }: McpRemoteSkillsPanelProps) {
  const enabled = skills.filter((skill) => skill.enabled).length;
  const lastRefresh = skills.reduce((latest, skill) => Math.max(latest, Date.parse(skill.refreshedAt) || 0), 0);

  return (
    <Card className="border-border/75 py-4" aria-labelledby="mcp-skills-title">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle id="mcp-skills-title" className="flex items-center gap-2 text-base">
            <BookOpen className="size-4 text-primary" />
            Remote skills
            <span className="text-sm font-normal text-muted-foreground">{enabled} of {skills.length} on</span>
          </CardTitle>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {lastRefresh > 0 && <span>Refreshed {formatAge(lastRefresh, now)} ago</span>}
            <Button size="icon" variant="ghost" onClick={onRefresh} disabled={refreshing} aria-label="Refresh remote skills">
              <RefreshCw className={cn('size-4', refreshing && 'animate-spin')} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {error && <p className="mb-2 text-sm text-red-400" role="alert">{error}</p>}
        {skills.length === 0 ? (
          <p className="text-sm text-muted-foreground">No remote skills.</p>
        ) : (
          <ul className="divide-y divide-border">
            {skills.map((skill) => {
              const label = `${skill.serverName} / ${skill.name}`;
              return (
                <li key={`${skill.serverName}\n${skill.uri}`} className="flex items-start gap-3 py-2.5">
                  <BookOpen className={cn('mt-0.5 size-4 shrink-0', skill.enabled ? 'text-primary' : 'text-muted-foreground')} aria-hidden />
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <p className="flex items-center gap-2 text-sm">
                      {label}
                      {skill.changed && <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-300">Changed</Badge>}
                    </p>
                    <p className="text-xs text-muted-foreground">{skill.description}</p>
                    <p className="truncate font-mono text-xs text-muted-foreground">{skill.uri}</p>
                    {skill.changed && <p className="text-xs text-amber-300">Sero asks again before this skill runs code.</p>}
                    {skill.dynamic && <p className="text-xs text-muted-foreground">Sero cannot check this skill&apos;s content, so it does not load it.</p>}
                  </div>
                  <Switch
                    checked={skill.enabled}
                    disabled={skill.dynamic}
                    onCheckedChange={(checked) => onToggle(skill, checked)}
                    aria-label={`Use ${label}`}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function formatAge(time: number, now: number): string {
  const minutes = Math.max(0, Math.round((now - time) / 60_000));
  if (minutes < 1) return 'less than 1 min';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours} h` : `${Math.round(hours / 24)} d`;
}

/**
 * ResourcesApp — manage subagent definitions and skills.
 *
 * Left panel: tabbed list (Agents / Skills). Right panel: editor for the
 * selected resource. All data comes from IPC (window.sero.subagent.*,
 * window.sero.skills.*).
 */

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@sero/ui/components/ui/button';
import { cn } from '@sero/ui/lib/utils';
import { AgentList } from './components/AgentList';
import { AgentEditor } from './components/AgentEditor';
import { SkillList } from './components/SkillList';
import { SkillEditor } from './components/SkillEditor';
import { useAgentCrud } from './hooks/useAgentCrud';
import { useSkillCrud } from './hooks/useSkillCrud';
import type { ResourceTab } from './components/types';
import './styles.css';

export function ResourcesApp() {
  const [tab, setTab] = useState<ResourceTab>('agents');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setErrorMsg = useCallback((msg: string) => setError(msg), []);

  const agentCrud = useAgentCrud(setErrorMsg, setSaving);
  const skillCrud = useSkillCrud(setErrorMsg, setSaving);

  // ── Initial load ───────────────────────────────────────────

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([agentCrud.refresh(), skillCrud.refresh()]).finally(() =>
      setLoading(false),
    );
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Tab switching ──────────────────────────────────────────

  const switchTab = useCallback((newTab: ResourceTab) => {
    setTab(newTab);
    setError(null);
  }, []);

  // ── Derived values for current tab ─────────────────────────

  const isAgents = tab === 'agents';
  const startNew = isAgents ? agentCrud.startNew : skillCrud.startNew;

  return (
    <div className="flex h-full w-full bg-background text-foreground">
      {/* ── Left: Tabbed list ──────────────────────────── */}
      <div className="flex w-64 shrink-0 flex-col border-r border-border">
        {/* Tab bar */}
        <div className="flex border-b border-border">
          <TabButton active={isAgents} onClick={() => switchTab('agents')}>
            🧠 Agents
          </TabButton>
          <TabButton active={!isAgents} onClick={() => switchTab('skills')}>
            ⚡ Skills
          </TabButton>
        </div>

        {/* Actions row */}
        <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
          <span className="flex-1 text-xs text-muted-foreground">
            {isAgents
              ? `${agentCrud.agents.length} agents`
              : `${skillCrud.skills.length} skills`}
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={isAgents ? agentCrud.refresh : skillCrud.refresh}
            title="Refresh"
          >
            <span className="text-xs">↻</span>
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={startNew}
            title={`New ${isAgents ? 'Agent' : 'Skill'}`}
          >
            <span className="text-xs">+</span>
          </Button>
        </div>

        {/* List */}
        {loading ? (
          <div className="flex flex-1 items-center justify-center">
            <span className="text-xs text-muted-foreground">Loading…</span>
          </div>
        ) : isAgents ? (
          <AgentList
            agents={agentCrud.agents}
            selected={agentCrud.selected}
            onSelect={agentCrud.select}
          />
        ) : (
          <SkillList
            skills={skillCrud.skills}
            selected={skillCrud.selected}
            onSelect={skillCrud.select}
          />
        )}
      </div>

      {/* ── Right: Editor ──────────────────────────────── */}
      <div className="flex flex-1 flex-col min-w-0">
        {error && (
          <div className="border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-xs text-destructive">
            {error}
          </div>
        )}

        {isAgents && agentCrud.editing ? (
          <AgentEditor
            data={agentCrud.editing}
            isNew={agentCrud.isNew}
            saving={saving}
            onSave={agentCrud.save}
            onDelete={agentCrud.remove}
            onChange={agentCrud.setEditing}
          />
        ) : !isAgents && skillCrud.editing ? (
          <SkillEditor
            data={skillCrud.editing}
            isNew={skillCrud.isNew}
            saving={saving}
            source={skillCrud.selectedSource}
            onSave={skillCrud.save}
            onDelete={skillCrud.remove}
            onChange={skillCrud.setEditing}
          />
        ) : (
          <EmptyState isAgents={isAgents} onNew={startNew} />
        )}
      </div>
    </div>
  );
}

// ── Empty state placeholder ──────────────────────────────────

function EmptyState({
  isAgents,
  onNew,
}: {
  isAgents: boolean;
  onNew: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3">
      <span className="text-5xl opacity-20">{isAgents ? '🧠' : '⚡'}</span>
      <p className="text-sm text-muted-foreground">
        {isAgents
          ? 'Select an agent to edit, or create a new one'
          : 'Select a skill to edit, or create a new one'}
      </p>
      <Button variant="secondary" size="sm" onClick={onNew}>
        + New {isAgents ? 'Agent' : 'Skill'}
      </Button>
    </div>
  );
}

// ── Tab button helper ────────────────────────────────────────

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex-1 px-3 py-2 text-xs font-medium transition-colors',
        active
          ? 'border-b-2 border-primary text-foreground'
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}

export default ResourcesApp;

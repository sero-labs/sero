/**
 * AgentsApp — manage subagent definitions (.md files).
 *
 * Left panel: agent list. Right panel: editor for the selected agent.
 * All data comes from IPC (window.sero.subagent.*), not useAppState.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@sero/ui/components/ui/button';
import { cn } from '@sero/ui/lib/utils';
import { AgentList } from './components/AgentList';
import { AgentEditor } from './components/AgentEditor';
import type { AgentSummary, AgentFileData } from './components/types';
import './styles.css';

const NEW_AGENT_TEMPLATE: AgentFileData = {
  name: '',
  description: '',
  model: '',
  thinking: '',
  timeoutMs: undefined,
  tools: [],
  systemPrompt: '',
};

export function AgentsApp() {
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<AgentFileData | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load agent list
  const refresh = useCallback(async () => {
    try {
      const list = await window.sero.subagent.listAgents();
      setAgents(list.map((a) => ({
        name: a.name,
        description: a.description,
        model: a.model,
        thinking: a.thinking,
        timeoutMs: a.timeoutMs,
      })));
      setError(null);
    } catch (err) {
      setError('Failed to load agents');
      console.error('[agents-app] refresh failed:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // Select an agent → load full content
  const selectAgent = useCallback(async (name: string) => {
    try {
      setSelected(name);
      setIsNew(false);
      const data = await window.sero.subagent.readAgent(name);
      setEditing(data);
      setError(null);
    } catch (err) {
      setError(`Failed to load agent '${name}'`);
      console.error('[agents-app] readAgent failed:', err);
    }
  }, []);

  // Create new
  const startNew = useCallback(() => {
    setSelected(null);
    setIsNew(true);
    setEditing({ ...NEW_AGENT_TEMPLATE });
  }, []);

  // Save
  const save = useCallback(async (data: AgentFileData) => {
    setSaving(true);
    try {
      await window.sero.subagent.writeAgent(data);
      await refresh();
      setSelected(data.name);
      setIsNew(false);
      setEditing(data);
      setError(null);
    } catch (err) {
      setError(`Failed to save agent '${data.name}'`);
      console.error('[agents-app] writeAgent failed:', err);
    } finally {
      setSaving(false);
    }
  }, [refresh]);

  // Delete
  const deleteAgent = useCallback(async (name: string) => {
    try {
      await window.sero.subagent.deleteAgent(name);
      if (selected === name) {
        setSelected(null);
        setEditing(null);
        setIsNew(false);
      }
      await refresh();
      setError(null);
    } catch (err) {
      setError(`Failed to delete agent '${name}'`);
      console.error('[agents-app] deleteAgent failed:', err);
    }
  }, [selected, refresh]);

  return (
    <div ref={containerRef} className="flex h-full w-full bg-background text-foreground">
      {/* ── Left: Agent list ───────────────────────────── */}
      <div className="flex w-64 shrink-0 flex-col border-r border-border">
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <span className="text-sm">🧠</span>
          <span className="flex-1 text-sm font-medium">Agents</span>
          <Button variant="ghost" size="icon-sm" onClick={refresh} title="Refresh">
            <span className="text-xs">↻</span>
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={startNew} title="New Agent">
            <span className="text-xs">+</span>
          </Button>
        </div>

        {loading ? (
          <div className="flex flex-1 items-center justify-center">
            <span className="text-xs text-muted-foreground">Loading…</span>
          </div>
        ) : (
          <AgentList
            agents={agents}
            selected={selected}
            onSelect={selectAgent}
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

        {editing ? (
          <AgentEditor
            data={editing}
            isNew={isNew}
            saving={saving}
            onSave={save}
            onDelete={deleteAgent}
            onChange={setEditing}
          />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3">
            <span className="text-5xl opacity-20">🧠</span>
            <p className="text-sm text-muted-foreground">
              Select an agent to edit, or create a new one
            </p>
            <Button variant="secondary" size="sm" onClick={startNew}>
              + New Agent
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export default AgentsApp;

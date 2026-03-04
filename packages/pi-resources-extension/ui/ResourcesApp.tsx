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
import type {
  ResourceTab,
  AgentSummary,
  AgentFileData,
  SkillSummary,
  SkillFileData,
} from './components/types';
import './styles.css';

const NEW_AGENT: AgentFileData = {
  name: '',
  description: '',
  model: '',
  thinking: '',
  timeoutMs: undefined,
  tools: [],
  systemPrompt: '',
};

const NEW_SKILL: SkillFileData = {
  name: '',
  description: '',
  extraFrontmatter: {},
  body: '',
};

export function ResourcesApp() {
  const [tab, setTab] = useState<ResourceTab>('agents');

  // ── Agent state ────────────────────────────────────────────
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [editingAgent, setEditingAgent] = useState<AgentFileData | null>(null);
  const [isNewAgent, setIsNewAgent] = useState(false);

  // ── Skill state ────────────────────────────────────────────
  const [skills, setSkills] = useState<SkillSummary[]>([]);
  const [selectedSkill, setSelectedSkill] = useState<string | null>(null);
  const [editingSkill, setEditingSkill] = useState<SkillFileData | null>(null);
  const [isNewSkill, setIsNewSkill] = useState(false);

  // ── Shared state ───────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Refresh helpers ────────────────────────────────────────

  const refreshAgents = useCallback(async () => {
    try {
      const list = await window.sero.subagent.listAgents();
      setAgents(list.map((a) => ({
        name: a.name,
        description: a.description,
        model: a.model,
        thinking: a.thinking,
        timeoutMs: a.timeoutMs,
      })));
    } catch (err) {
      setError('Failed to load agents');
      console.error('[resources-app] refreshAgents failed:', err);
    }
  }, []);

  const refreshSkills = useCallback(async () => {
    try {
      const list = await window.sero.skills.listSkills();
      setSkills(list);
    } catch (err) {
      setError('Failed to load skills');
      console.error('[resources-app] refreshSkills failed:', err);
    }
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    await Promise.all([refreshAgents(), refreshSkills()]);
    setLoading(false);
  }, [refreshAgents, refreshSkills]);

  useEffect(() => { refresh(); }, [refresh]);

  // ── Agent actions ──────────────────────────────────────────

  const selectAgent = useCallback(async (name: string) => {
    try {
      setSelectedAgent(name);
      setIsNewAgent(false);
      const data = await window.sero.subagent.readAgent(name);
      setEditingAgent(data);
      setError(null);
    } catch (err) {
      setError(`Failed to load agent '${name}'`);
    }
  }, []);

  const startNewAgent = useCallback(() => {
    setSelectedAgent(null);
    setIsNewAgent(true);
    setEditingAgent({ ...NEW_AGENT });
  }, []);

  const saveAgent = useCallback(async (data: AgentFileData) => {
    setSaving(true);
    try {
      await window.sero.subagent.writeAgent(data);
      await refreshAgents();
      setSelectedAgent(data.name);
      setIsNewAgent(false);
      setEditingAgent(data);
      setError(null);
    } catch (err) {
      setError(`Failed to save agent '${data.name}'`);
    } finally {
      setSaving(false);
    }
  }, [refreshAgents]);

  const deleteAgent = useCallback(async (name: string) => {
    try {
      await window.sero.subagent.deleteAgent(name);
      if (selectedAgent === name) {
        setSelectedAgent(null);
        setEditingAgent(null);
        setIsNewAgent(false);
      }
      await refreshAgents();
      setError(null);
    } catch (err) {
      setError(`Failed to delete agent '${name}'`);
    }
  }, [selectedAgent, refreshAgents]);

  // ── Skill actions ──────────────────────────────────────────
  // selectedSkill tracks filePath (unique), not name (can collide).

  const selectSkill = useCallback(async (filePath: string) => {
    try {
      setSelectedSkill(filePath);
      setIsNewSkill(false);
      const data = await window.sero.skills.readSkill(filePath);
      setEditingSkill(data);
      setError(null);
    } catch (err) {
      const name = filePath.split('/').at(-2) ?? filePath;
      setError(`Failed to load skill '${name}'`);
    }
  }, []);

  const startNewSkill = useCallback(() => {
    setSelectedSkill(null);
    setIsNewSkill(true);
    setEditingSkill({ ...NEW_SKILL, extraFrontmatter: {} });
  }, []);

  const saveSkill = useCallback(async (data: SkillFileData) => {
    setSaving(true);
    try {
      await window.sero.skills.writeSkill(data);
      await refreshSkills();
      // After save, select by filePath if available (existing), else stay on new
      if (data.filePath) {
        setSelectedSkill(data.filePath);
      }
      setIsNewSkill(false);
      setEditingSkill(data);
      setError(null);
    } catch (err) {
      setError(`Failed to save skill '${data.name}'`);
    } finally {
      setSaving(false);
    }
  }, [refreshSkills]);

  const deleteSkill = useCallback(async (filePath: string) => {
    try {
      await window.sero.skills.deleteSkill(filePath);
      if (selectedSkill === filePath) {
        setSelectedSkill(null);
        setEditingSkill(null);
        setIsNewSkill(false);
      }
      await refreshSkills();
      setError(null);
    } catch (err) {
      const name = filePath.split('/').at(-2) ?? filePath;
      setError(`Failed to delete skill '${name}'`);
    }
  }, [selectedSkill, refreshSkills]);

  // ── Tab switching clears editor selection ──────────────────

  const switchTab = useCallback((newTab: ResourceTab) => {
    setTab(newTab);
    setError(null);
  }, []);

  // ── Derived values for current tab ─────────────────────────

  const isAgents = tab === 'agents';
  const hasEditor = isAgents ? !!editingAgent : !!editingSkill;
  const emptyIcon = isAgents ? '🧠' : '⚡';
  const emptyLabel = isAgents
    ? 'Select an agent to edit, or create a new one'
    : 'Select a skill to edit, or create a new one';
  const startNew = isAgents ? startNewAgent : startNewSkill;

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
            {isAgents ? `${agents.length} agents` : `${skills.length} skills`}
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={isAgents ? refreshAgents : refreshSkills}
            title="Refresh"
          >
            <span className="text-xs">↻</span>
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={startNew} title={`New ${isAgents ? 'Agent' : 'Skill'}`}>
            <span className="text-xs">+</span>
          </Button>
        </div>

        {/* List */}
        {loading ? (
          <div className="flex flex-1 items-center justify-center">
            <span className="text-xs text-muted-foreground">Loading…</span>
          </div>
        ) : isAgents ? (
          <AgentList agents={agents} selected={selectedAgent} onSelect={selectAgent} />
        ) : (
          <SkillList skills={skills} selected={selectedSkill} onSelect={selectSkill} />
        )}
      </div>

      {/* ── Right: Editor ──────────────────────────────── */}
      <div className="flex flex-1 flex-col min-w-0">
        {error && (
          <div className="border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-xs text-destructive">
            {error}
          </div>
        )}

        {isAgents && editingAgent ? (
          <AgentEditor
            data={editingAgent}
            isNew={isNewAgent}
            saving={saving}
            onSave={saveAgent}
            onDelete={deleteAgent}
            onChange={setEditingAgent}
          />
        ) : !isAgents && editingSkill ? (
          <SkillEditor
            data={editingSkill}
            isNew={isNewSkill}
            saving={saving}
            onSave={saveSkill}
            onDelete={deleteSkill}
            onChange={setEditingSkill}
          />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3">
            <span className="text-5xl opacity-20">{emptyIcon}</span>
            <p className="text-sm text-muted-foreground">{emptyLabel}</p>
            <Button variant="secondary" size="sm" onClick={startNew}>
              + New {isAgents ? 'Agent' : 'Skill'}
            </Button>
          </div>
        )}
      </div>
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

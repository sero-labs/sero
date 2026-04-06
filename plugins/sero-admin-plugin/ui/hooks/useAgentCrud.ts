/**
 * useAgentCrud — encapsulates agent list + selection + CRUD actions.
 */

import { useState, useCallback } from 'react';
import type { AgentSummary, AgentFileData } from '../components/types';
import { getSero } from './useSeroFiles';
import type { AgentSummaryIPC } from './useSeroFiles';

const NEW_AGENT: AgentFileData = {
  name: '',
  description: '',
  model: '',
  thinking: '',
  timeoutMs: undefined,
  tools: [],
  systemPrompt: '',
};

export interface AgentCrud {
  agents: AgentSummary[];
  selected: string | null;
  editing: AgentFileData | null;
  isNew: boolean;
  /** Update the editing state (for form field changes). */
  setEditing: (data: AgentFileData | null) => void;
  refresh: () => Promise<void>;
  select: (name: string) => Promise<void>;
  startNew: () => void;
  save: (data: AgentFileData) => Promise<void>;
  remove: (name: string) => Promise<void>;
}

export function useAgentCrud(
  onError: (msg: string) => void,
  setSaving: (v: boolean) => void,
): AgentCrud {
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<AgentFileData | null>(null);
  const [isNew, setIsNew] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const list = await getSero().subagent.listAgents();
      setAgents(list.map((a: AgentSummaryIPC) => ({
        name: a.name,
        description: a.description,
        model: a.model,
        thinking: a.thinking,
        timeoutMs: a.timeoutMs,
      })));
    } catch (err) {
      onError('Failed to load agents');
      console.error('[resources-app] refreshAgents failed:', err);
    }
  }, [onError]);

  const select = useCallback(async (name: string) => {
    try {
      setSelected(name);
      setIsNew(false);
      const data = await getSero().subagent.readAgent(name);
      setEditing(data);
    } catch (err) {
      onError(`Failed to load agent '${name}'`);
    }
  }, [onError]);

  const startNew = useCallback(() => {
    setSelected(null);
    setIsNew(true);
    setEditing({ ...NEW_AGENT });
  }, []);

  const save = useCallback(async (data: AgentFileData) => {
    setSaving(true);
    try {
      await getSero().subagent.writeAgent(data);
      await refresh();
      setSelected(data.name);
      setIsNew(false);
      setEditing(data);
    } catch (err) {
      onError(`Failed to save agent '${data.name}'`);
    } finally {
      setSaving(false);
    }
  }, [onError, setSaving, refresh]);

  const remove = useCallback(async (name: string) => {
    try {
      await getSero().subagent.deleteAgent(name);
      if (selected === name) {
        setSelected(null);
        setEditing(null);
        setIsNew(false);
      }
      await refresh();
    } catch (err) {
      onError(`Failed to delete agent '${name}'`);
    }
  }, [selected, onError, refresh]);

  return {
    agents, selected, editing, isNew, setEditing,
    refresh, select, startNew, save, remove,
  };
}

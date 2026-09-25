import { useAppTools } from '@sero-ai/app-runtime';
import { useCallback, useEffect, useState } from 'react';
import type { McpRemoteSkillSummary } from '../../shared/skills';

export interface McpRemoteSkillsState {
  skills: McpRemoteSkillSummary[];
  error: string | null;
  refreshing: boolean;
  refresh: () => Promise<void>;
  setEnabled: (skill: McpRemoteSkillSummary, enabled: boolean) => Promise<void>;
}

/** The remote skills of every connected server, from the MCP runtime's registry. */
export function useMcpRemoteSkills(): McpRemoteSkillsState {
  const { run } = useAppTools();
  const [skills, setSkills] = useState<McpRemoteSkillSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const result = await run('mcp_manager', { action: 'list_skills' });
    setSkills(Array.isArray(result.details?.skills) ? result.details.skills as McpRemoteSkillSummary[] : []);
  }, [run]);

  // Loading from the runtime is an external side effect of opening the panel.
  useEffect(() => {
    load().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)));
  }, [load]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await run('mcp_manager', { action: 'refresh_skills' });
      await load();
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setRefreshing(false);
    }
  }, [load, run]);

  const setEnabled = useCallback(async (skill: McpRemoteSkillSummary, enabled: boolean) => {
    const result = await run('mcp_manager', { action: 'set_skill_enabled', serverName: skill.serverName, skillUri: skill.uri, enabled });
    if (result.isError) setError(result.text);
    await load();
  }, [load, run]);

  return { skills, error, refreshing, refresh, setEnabled };
}

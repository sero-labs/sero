import { useActiveSessionSync } from '@/hooks/session-agent/useActiveSessionSync';
import { useContainerEnsureOnSessionFocus } from '@/hooks/session-agent/useContainerEnsureOnSessionFocus';
import { useSessionListRefreshOnAgentIdle } from '@/hooks/session-agent/useSessionListRefreshOnAgentIdle';

/**
 * Bridges session selection → agent lifecycle + container lifecycle.
 *
 * When activeSessionId changes:
 *   - Opens an AgentSession in the pool (if not already open)
 *   - Focuses it in the ChatPanel
 *   - Ensures the workspace container is running (if container-enabled)
 *
 * When activeSessionId becomes null:
 *   - Clears ChatPanel focus (agents stay alive in pool)
 *
 * Also refreshes the session list after any agent finishes a turn
 * so the sidebar shows updated firstMessage / messageCount.
 */
export function useSessionAgent() {
  useActiveSessionSync();
  useContainerEnsureOnSessionFocus();
  useSessionListRefreshOnAgentIdle();
}

import type { ChatToolResultViewProps } from '@sero-ai/common';
import { FederatedContributionMount } from '@/components/apps/FederatedContributionMount';
import { useFocusedSessionId } from '@/stores/agent-selectors';
import { getContributions, useAppStore } from '@/stores/app';
import type { ChatToolCallMessage } from '@/types/ipc';
import { readToolResultView } from './read-tool-result-view';

/**
 * Mounts the `ui.chat.tool-result` component that a tool result names. It
 * shows nothing when no contribution matches or the component fails, so the
 * normal result text is all that remains.
 */
export function ToolResultView({ tool }: { tool: ChatToolCallMessage }) {
  const apps = useAppStore((state) => state.apps);
  const sessionId = useFocusedSessionId();
  const marker = readToolResultView(tool);
  if (!marker || !sessionId || !tool.details) return null;

  const match = getContributions(apps, 'ui.chat.tool-result').find((resolved) => (
    resolved.appId === marker.appId && resolved.contribution.id === marker.contributionId
  ));
  if (!match) return null;

  const props: ChatToolResultViewProps = {
    sessionId,
    toolCallId: tool.toolCallId,
    details: tool.details,
    isError: tool.isError,
  };
  return (
    <FederatedContributionMount
      manifest={match.manifest}
      contribution={match.contribution}
      contributionKey={match.key}
      loading={null}
      unavailable={null}
      componentProps={props}
    />
  );
}

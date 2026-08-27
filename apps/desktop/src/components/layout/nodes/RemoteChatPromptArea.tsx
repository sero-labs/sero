import { useState } from 'react';
import { ChatComposer } from '@/components/layout/ChatComposer';
import { useNodesStore } from '@/stores/nodes';
import type { AgentNodeInfo, AgentNodeSession } from '@/types/agent-node';
import { canSendToNode } from './node-display';
import { RemoteApprovalControl } from './RemoteApprovalControl';
import { RemoteModelSelector } from './RemoteModelSelector';

export function RemoteChatPromptArea({
  node,
  session,
}: {
  node: AgentNodeInfo;
  session: AgentNodeSession;
}) {
  const [draft, setDraft] = useState('');
  const sendMessage = useNodesStore((state) => state.sendMessage);
  const cancelTask = useNodesStore((state) => state.cancelTask);
  const disabled = !canSendToNode(node);

  return (
    <ChatComposer
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onSubmit={async (message) => {
        const text = message.text.trim();
        if (!text) return;
        setDraft('');
        await sendMessage(node.id, session.id, text);
      }}
      placeholder="Message the agent…"
      disabled={disabled}
      isStreaming={Boolean(session.taskId)}
      onStop={() => {
        if (session.taskId) void cancelTask(node.id, session.taskId);
      }}
      maxFiles={0}
      tools={(
        <>
          <RemoteApprovalControl node={node} session={session} />
          <RemoteModelSelector node={node} session={session} />
        </>
      )}
      toolsClassName="flex-1"
    />
  );
}

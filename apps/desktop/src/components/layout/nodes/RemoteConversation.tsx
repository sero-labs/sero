import { useMemo } from 'react';
import { Bot } from 'lucide-react';
import { Conversation, ConversationContent, ConversationScrollButton } from '@sero-ai/ui/ai-elements/conversation';
import { Button } from '@sero-ai/ui/components/ui/button';
import { ChatMessageItem } from '@/components/layout/ChatMessageItem';
import { EmptyState, ThinkingIndicator } from '@/components/layout/ChatPanelHelpers';
import { ToolCallGroup } from '@/components/layout/ToolCallGroup';
import { groupMessages, isToolGroupFinalized } from '@/components/layout/tool-call-helpers/group-messages';
import { useAgentStore } from '@/stores/agent';
import { useNodesStore, type SessionLocation } from '@/stores/nodes';
import { NodeStatusStrip } from './NodeStatusStrip';
import { NodeArtifacts } from './NodeArtifacts';
import { RemoteChatPromptArea } from './RemoteChatPromptArea';
import { NodeConnectionIndicator } from './NodeConnectionIndicator';
import { nodeDisplayName } from './node-display';

const EMPTY_MESSAGES: ReturnType<typeof useNodesStore.getState>['messages'][string] = [];

export function RemoteConversation({ location }: { location: Extract<SessionLocation, { kind: 'node' }> }) {
  const node = useNodesStore((state) => state.nodes.find((item) => item.id === location.nodeId));
  const session = useNodesStore((state) => (state.sessions[location.nodeId] ?? []).find((item) => item.id === location.sessionId));
  const messages = useNodesStore((state) => state.messages[state.activeLocationKey ?? ''] ?? EMPTY_MESSAGES);
  const approval = useNodesStore((state) => state.approvals[state.activeLocationKey ?? ''] ?? null);
  const { retry, respondApproval } = useNodesStore.getState();
  const showThinkingBlocks = useAgentStore((state) => state.showThinkingBlocks);
  const groupedItems = useMemo(() => groupMessages(messages), [messages]);
  const showThinking = Boolean(session?.taskId) && !groupedItems.some((item) => item.kind === 'message'
    ? item.message.type === 'assistant' && item.message.isStreaming
    : item.tools.some((tool) => tool.state === 'pending' || tool.state === 'running'));
  if (!node || !session) return <div className="flex h-full items-center justify-center text-sm text-(--text-muted)">Loading node session…</div>;

  return <div className="flex h-full flex-col border-l border-(--border-default) bg-(--bg-surface)">
    <div className="flex h-9 items-center gap-2 border-b border-(--border-default) px-3"><Bot className="size-3.5 text-(--text-muted)" /><span className="text-sm font-semibold uppercase tracking-[0.18em] text-(--text-secondary)">Agent</span><span className="truncate rounded bg-(--bg-elevated) px-1.5 py-0.5 text-xs text-(--text-muted)">{session.name || session.firstMessage || 'New chat'}</span><span className="ml-auto flex items-center gap-1.5 rounded bg-(--bg-elevated) px-1.5 py-0.5 text-xs text-(--text-secondary)"><NodeConnectionIndicator state={node.connectionState} />{nodeDisplayName(node)}</span></div>
    <NodeStatusStrip node={node} onRetry={() => void retry(node.id)} />
    <Conversation key={session.id} className="min-h-0 flex-1" initial="instant">
      <ConversationContent className="gap-2.5 p-3">
        {messages.length === 0 && !session.taskId ? <EmptyState message="Start a conversation" /> : groupedItems.map((item, index) => item.kind === 'tool-group'
          ? <ToolCallGroup key={item.id} tools={item.tools} isFinalized={isToolGroupFinalized(groupedItems, index)} />
          : <ChatMessageItem key={item.message.id} message={item.message} showThinking={showThinkingBlocks} showMemory={false} sessionId={session.id} />)}
        {showThinking ? <ThinkingIndicator /> : null}
        <NodeArtifacts nodeId={node.id} sessionKey={useNodesStore.getState().activeLocationKey ?? ''} />
      </ConversationContent>
      <ConversationScrollButton />
    </Conversation>
    {approval ? <section className="mx-3 mb-2 rounded-md border border-status-warning p-3" aria-label="Remote tool approval"><p className="text-sm font-semibold">{approval.title}</p>{approval.description ? <p className="mt-1 text-xs text-(--text-secondary)">{approval.description}</p> : null}<div className="mt-2 flex justify-end gap-2"><Button size="sm" variant="ghost" onClick={() => void respondApproval(node.id, session.id, false)}>Deny</Button><Button size="sm" variant="ghost" onClick={() => void respondApproval(node.id, session.id, true, 'once')}>Approve once</Button><Button size="sm" onClick={() => void respondApproval(node.id, session.id, true, 'session')}>Allow for session</Button></div></section> : null}
    <RemoteChatPromptArea key={`composer:${session.id}`} node={node} session={session} />
  </div>;
}

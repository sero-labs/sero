import { useMemo, useState } from 'react';
import { Bot, Square } from 'lucide-react';
import { Conversation, ConversationContent, ConversationScrollButton } from '@sero-ai/ui/ai-elements/conversation';
import { Button } from '@sero-ai/ui/components/ui/button';
import { Input } from '@sero-ai/ui/components/ui/input';
import { ChatMessageItem } from '@/components/layout/ChatMessageItem';
import { EmptyState, ThinkingIndicator } from '@/components/layout/ChatPanelHelpers';
import { groupMessages, isToolGroupFinalized, ToolCallGroup } from '@/components/layout/ToolCallGroup';
import { useAgentStore } from '@/stores/agent';
import { useNodesStore, type SessionLocation } from '@/stores/nodes';
import { NodeStatusStrip } from './NodeStatusStrip';
import { NodeArtifacts } from './NodeArtifacts';

const EMPTY_MESSAGES: ReturnType<typeof useNodesStore.getState>['messages'][string] = [];

export function RemoteConversation({ location }: { location: Extract<SessionLocation, { kind: 'node' }> }) {
  const node = useNodesStore((state) => state.nodes.find((item) => item.id === location.nodeId));
  const session = useNodesStore((state) => (state.sessions[location.nodeId] ?? []).find((item) => item.id === location.sessionId));
  const messages = useNodesStore((state) => state.messages[state.activeLocationKey ?? ''] ?? EMPTY_MESSAGES);
  const approval = useNodesStore((state) => state.approvals[state.activeLocationKey ?? ''] ?? null);
  const { retry, sendMessage, cancelTask, setSessionModel, setSessionApprovalMode, respondApproval } = useNodesStore.getState();
  const [draft, setDraft] = useState('');
  const [model, setModel] = useState(session?.model ?? '');
  const showThinkingBlocks = useAgentStore((state) => state.showThinkingBlocks);
  const groupedItems = useMemo(() => groupMessages(messages), [messages]);
  const showThinking = Boolean(session?.taskId) && !groupedItems.some((item) => item.kind === 'message'
    ? item.message.type === 'assistant' && item.message.isStreaming
    : item.tools.some((tool) => tool.state === 'pending' || tool.state === 'running'));
  if (!node || !session) return <div className="flex h-full items-center justify-center text-sm text-(--text-muted)">Loading node session…</div>;

  const send = async () => {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    await sendMessage(node.id, session.id, text);
  };
  return <div className="flex h-full flex-col border-l border-(--border-default) bg-(--bg-surface)">
    <div className="flex h-9 items-center gap-2 border-b border-(--border-default) px-3"><Bot className="size-3.5 text-(--text-muted)" /><span className="text-sm font-semibold uppercase tracking-[0.18em] text-(--text-secondary)">Agent</span><span className="truncate rounded bg-(--bg-elevated) px-1.5 py-0.5 text-xs text-(--text-muted)">{session.name || session.firstMessage || 'New chat'}</span><span className="ml-auto rounded bg-(--bg-elevated) px-1.5 py-0.5 text-xs">{node.name}</span></div>
    <NodeStatusStrip node={node} onRetry={() => void retry(node.id)} />
    <div className="flex items-center gap-1 border-b border-(--border-subtle) px-3 py-1.5"><span className="text-xs text-(--text-muted)">Model</span><Input aria-label="Remote session model" className="h-7 max-w-48 text-xs" value={model} onChange={(event) => setModel(event.target.value)} /><Button size="sm" variant="ghost" disabled={node.connectionState === 'version-skew' || model === session.model || !model.trim()} onClick={() => void setSessionModel(node.id, session.id, model.trim())}>Apply next turn</Button><Button size="sm" variant="ghost" title={session.approvalMode === 'allow' ? 'Require approval before remote write and shell tools' : 'Allow remote write and shell tools without approval'} onClick={() => void setSessionApprovalMode(node.id, session.id, session.approvalMode === 'allow' ? 'ask' : 'allow')}>{session.approvalMode === 'allow' ? 'Require approvals' : 'Allow commands'}</Button><span className="ml-auto text-xs text-(--text-muted)" title={node.tools.join(', ')}>{node.tools.length} tools</span></div>
    <Conversation key={session.id} className="min-h-0 flex-1" initial="instant">
      <ConversationContent className="gap-2.5 p-3">
        {messages.length === 0 && !session.taskId ? <EmptyState message="Start a conversation" /> : groupedItems.map((item, index) => item.kind === 'tool-group'
          ? <ToolCallGroup key={item.id} tools={item.tools} isFinalized={isToolGroupFinalized(groupedItems, index)} />
          : <ChatMessageItem key={item.message.id} message={item.message} showThinking={showThinkingBlocks} showMemory={false} sessionId={session.id} />)}
        {showThinking ? <ThinkingIndicator /> : null}
      </ConversationContent>
      <ConversationScrollButton />
    </Conversation>
    <NodeArtifacts nodeId={node.id} sessionKey={useNodesStore.getState().activeLocationKey ?? ''} />
    {approval ? <section className="mx-3 mb-2 rounded-md border border-status-warning p-3" aria-label="Remote tool approval"><p className="text-sm font-semibold">{approval.title}</p>{approval.description ? <p className="mt-1 text-xs text-(--text-secondary)">{approval.description}</p> : null}<div className="mt-2 flex justify-end gap-2"><Button size="sm" variant="ghost" onClick={() => void respondApproval(node.id, session.id, false)}>Deny</Button><Button size="sm" variant="ghost" onClick={() => void respondApproval(node.id, session.id, true, 'once')}>Approve once</Button><Button size="sm" onClick={() => void respondApproval(node.id, session.id, true, 'session')}>Allow for session</Button></div></section> : null}
    <div className="flex gap-2 border-t border-(--border-default) p-3"><Input aria-label="Message Agent Node" value={draft} placeholder="Message the agent…" onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(); } }} /><Button onClick={() => void send()}>Send</Button>{session.taskId ? <Button size="icon" variant="ghost" aria-label="Stop remote task" onClick={() => void cancelTask(node.id, session.taskId!)}><Square className="size-3.5" /></Button> : null}</div>
  </div>;
}

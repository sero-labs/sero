import { useEffect, useMemo, useState } from 'react';
import {
  PromptInputSelect,
  PromptInputSelectContent,
  PromptInputSelectItem,
  PromptInputSelectTrigger,
  PromptInputSelectValue,
} from '@sero-ai/ui/ai-elements/prompt-input';
import { ChatComposer } from '@/components/layout/ChatComposer';
import { useNodesStore } from '@/stores/nodes';
import type { AgentNodeInfo, AgentNodeModel, AgentNodeSession } from '@/types/agent-node';

function modelReference(model: AgentNodeModel): string {
  return `${model.providerId}/${model.modelId}`;
}

export function RemoteChatPromptArea({
  node,
  session,
}: {
  node: AgentNodeInfo;
  session: AgentNodeSession;
}) {
  const [draft, setDraft] = useState('');
  const [selectedModel, setSelectedModel] = useState(session.model);
  const models = useNodesStore((state) => state.models[node.id] ?? []);
  const sendMessage = useNodesStore((state) => state.sendMessage);
  const cancelTask = useNodesStore((state) => state.cancelTask);
  const loadModels = useNodesStore((state) => state.loadModels);
  const setSessionModel = useNodesStore((state) => state.setSessionModel);
  const modelOptions = useMemo(
    () => models.some((model) => modelReference(model) === selectedModel)
      ? models
      : [{ providerId: '', modelId: selectedModel, name: selectedModel }, ...models],
    [models, selectedModel],
  );
  const disabled = node.connectionState === 'revoked' || node.connectionState === 'version-skew';

  useEffect(() => {
    if (models.length === 0 && !disabled) void loadModels(node.id);
  }, [disabled, loadModels, models.length, node.id]);

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
        <PromptInputSelect
          value={selectedModel}
          onValueChange={(value) => {
            setSelectedModel(value);
            void setSessionModel(node.id, session.id, value);
          }}
          disabled={disabled}
        >
          <PromptInputSelectTrigger
            aria-label="Remote session model"
            className="h-7 max-w-56 border-0 bg-transparent px-2 text-sm shadow-none"
            title="Model changes apply on the next turn"
          >
            <PromptInputSelectValue />
          </PromptInputSelectTrigger>
          <PromptInputSelectContent>
            {modelOptions.map((model) => {
              const value = model.providerId ? modelReference(model) : model.modelId;
              return (
                <PromptInputSelectItem key={value} value={value}>
                  {model.name}
                </PromptInputSelectItem>
              );
            })}
          </PromptInputSelectContent>
        </PromptInputSelect>
      )}
    />
  );
}

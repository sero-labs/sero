import { FederatedContributionMount } from '@/components/apps/FederatedContributionMount';
import { getContributions, useAppStore } from '@/stores/app';
import { useAgentStore } from '@/stores/agent';
import type { ChatModelExtensionContribution } from '@sero-ai/common';
import type { ModelInfo } from '@/types/agent';

export function matchesModelExtension(contribution: ChatModelExtensionContribution, model: ModelInfo): boolean {
  return contribution.models.some((match) => match.provider === model.provider && match.api === model.api && match.modelId === model.modelId);
}

export function ModelExtensionActions({ sessionId }: { sessionId: string | null }) {
  const apps = useAppStore((state) => state.apps);
  const model = useAgentStore((state) => sessionId ? state.agents[sessionId]?.modelState?.model ?? null : null);
  if (!model) return null;
  const contributions = getContributions(apps, 'ui.chat.model-extension').filter(({ contribution }) => (
    matchesModelExtension(contribution, model)
  ));
  if (contributions.length === 0) return null;

  return contributions.map((resolved) => (
    <FederatedContributionMount
      key={resolved.key}
      manifest={resolved.manifest}
      contribution={resolved.contribution}
      contributionKey={resolved.key}
      loading={null}
      unavailable={null}
    />
  ));
}

/**
 * A step's Tune panel with the shared model picker, at the width of
 * `8-model-pickers.html` frame 1, so the built field can be put beside it.
 *
 * The step is the captured "Implement accessible composable title search": a
 * background-agent step, so the Model, Agent and Tools controls all show. The
 * catalogue carries several providers, so a row's provider label and the chosen
 * check mark can be read in a capture.
 */

import { useEffect, useRef } from 'react';
import type { AppModelGroup } from '@sero-ai/app-runtime';
import type { ContextAgentInfo, ContextToolInfo } from '@sero-ai/common';
import type { Loop, LoopStepDefinition } from '../../shared/types';
import { previewLoop } from './fixture';
import { StepCard } from '../components/StepCard';

const GROUPS: AppModelGroup[] = [
  {
    provider: 'openai-codex',
    displayName: 'OpenAI Codex',
    logo: '',
    models: [
      { provider: 'openai-codex', modelId: 'gpt-5.3-codex-spark', name: 'GPT-5.3 Codex Spark', reasoning: true },
      { provider: 'openai-codex', modelId: 'gpt-5.6-luna', name: 'GPT-5.6 Luna', reasoning: true },
      { provider: 'openai-codex', modelId: 'gpt-5.6-sol', name: 'GPT-5.6 Sol', reasoning: true },
      { provider: 'openai-codex', modelId: 'gpt-6-astra', name: 'GPT-6 Astra', reasoning: true },
    ],
  },
  {
    provider: 'anthropic',
    displayName: 'Anthropic',
    logo: '',
    models: [
      { provider: 'anthropic', modelId: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5 (latest)', reasoning: true },
      { provider: 'anthropic', modelId: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', reasoning: true },
      { provider: 'anthropic', modelId: 'claude-sonnet-5', name: 'Claude Sonnet 5', reasoning: true },
      { provider: 'anthropic', modelId: 'claude-opus-5', name: 'Claude Opus 5', reasoning: true },
      { provider: 'anthropic', modelId: 'claude-haiku-4-5', name: 'Claude Haiku 4.5 (latest)', reasoning: true },
    ],
  },
  {
    provider: 'deepseek',
    displayName: 'DeepSeek',
    logo: '',
    models: [
      { provider: 'deepseek', modelId: 'deepseek-flash', name: 'DeepSeek V4.1 Flash', reasoning: true },
      { provider: 'deepseek', modelId: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro', reasoning: true },
    ],
  },
] as AppModelGroup[];

const STEP: LoopStepDefinition = {
  id: 'implement',
  title: 'Implement accessible composable title search',
  instructions: 'Add a composable title search that keeps its results reachable from the keyboard.',
  execution: { type: 'background-agent', agent: 'implementer', model: 'MED' },
};

const LOOP: Loop = {
  ...previewLoop,
  id: 'composable-title-search',
  title: 'Composable title search',
  plan: { ...previewLoop.plan, steps: [STEP] },
  runtime: {
    ...previewLoop.runtime,
    stepStates: {
      implement: {
        status: 'succeeded',
        attempts: 1,
        updatedAt: new Date().toISOString(),
        outcome: { status: 'succeeded', summary: 'Title search shipped with keyboard support.' },
      },
    },
  },
};

const NUMBER_OF = new Map([[STEP.id, 1]]);
const AGENTS: ContextAgentInfo[] = [{ name: 'implementer', description: 'Writes the change.' }];
const TOOLS: ContextToolInfo[] = [{ name: 'read', label: 'Read' }];

/** Tune opens on mount, so a capture shows the model field without a click. */
export function StepTunePreview() {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    host.current
      ?.querySelector<HTMLButtonElement>('button[aria-label^="Model, agent and tools"]')
      ?.click();
  }, []);

  return (
    <div ref={host} className="rounded-lg border border-room-line bg-room-surface p-3">
      <StepCard
        step={STEP}
        number={1}
        loop={LOOP}
        numberOf={NUMBER_OF}
        showNumber={false}
        state={LOOP.runtime.stepStates[STEP.id]}
        groups={GROUPS}
        toolCatalog={TOOLS}
        agentCatalog={AGENTS}
        onSetModel={() => undefined}
        onSetTools={() => undefined}
        onSetAgent={() => undefined}
      />
    </div>
  );
}

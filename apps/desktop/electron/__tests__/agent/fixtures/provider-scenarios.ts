export interface ToolCallScript {
  id: string;
  toolName: string;
  argChunks: string[];
}

export type AttemptStep =
  | { kind: 'text'; chunks: string[] }
  | { kind: 'tool_calls'; calls: ToolCallScript[] };

export interface ProviderAttempt {
  steps: AttemptStep[];
  end: { kind: 'finish'; reason: 'stop' | 'tool_calls' } | { kind: 'hang' | 'close' };
}

export interface ProviderScenario {
  prompt: string;
  attempts: ProviderAttempt[];
}

export const FIXTURE_PROVIDER_ID = 'sero-test-provider';
export const FIXTURE_MODEL_ID = 'sero-test-model';

export const PROVIDER_SCENARIOS = {
  plainText: {
    prompt: 'Say hello.',
    attempts: [{
      steps: [{ kind: 'text', chunks: ['Hello', ' from', ' the', ' fixture.'] }],
      end: { kind: 'finish', reason: 'stop' },
    }],
  },
  partialToolTimeout: {
    prompt: 'Write the large file.',
    attempts: [{
      steps: [{
        kind: 'tool_calls',
        calls: [{
          id: 'call_write_stall',
          toolName: 'write',
          argChunks: ['{"path":"large-file.txt"'],
        }],
      }],
      end: { kind: 'hang' },
    }],
  },
  retryThenSuccess: {
    prompt: 'Answer despite the flaky stream.',
    attempts: [
      {
        steps: [{ kind: 'text', chunks: ['Partial answer'] }],
        end: { kind: 'close' },
      },
      {
        steps: [{ kind: 'text', chunks: ['Recovered', ' answer.'] }],
        end: { kind: 'finish', reason: 'stop' },
      },
    ],
  },
} satisfies Record<string, ProviderScenario>;

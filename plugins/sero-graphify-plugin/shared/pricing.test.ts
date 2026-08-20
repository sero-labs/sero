import { describe, expect, it } from 'vitest';
import { costUsd, estimateFromScan, formatEstimate, MODEL_ENV_VAR, priceFor } from './pricing';
import type { ModelChoice } from './types';

const choice = (backend: ModelChoice['backend'], modelId: string, price?: ModelChoice['price']): ModelChoice =>
  ({ backend, modelId, chosenAt: 'now', price });

describe('priceFor', () => {
  it('prices a model the CLI itself prices', () => {
    expect(priceFor(choice('openai', 'gpt-4.1-mini'))).toEqual({ input: 0.4, output: 1.6 });
  });

  it('returns null for a model nobody has priced', () => {
    // Reporting "unknown" is the point: a confident wrong number is worse than
    // no number when someone is deciding whether to spend.
    expect(priceFor(choice('openai', 'gpt-5.6-luna'))).toBeNull();
  });

  it('lets the user price their own model', () => {
    const price = { input: 0.05, output: 0.2 };
    expect(priceFor(choice('openai', 'gpt-5.6-luna', price))).toEqual(price);
  });

  it("a user's price wins over the built-in table", () => {
    const price = { input: 0, output: 0 };
    expect(priceFor(choice('openai', 'gpt-4.1-mini', price))).toEqual(price);
  });

  it('costs nothing on the Claude Code subscription', () => {
    expect(costUsd(choice('claude-cli', 'sonnet'), 1_000_000, 1_000_000)).toBe(0);
  });
});

describe('estimateFromScan', () => {
  it('reports an unknown cost rather than guessing', () => {
    const estimate = estimateFromScan({ files: 3, bytes: 4000, truncated: false }, choice('openai', 'gpt-5.6-luna'));
    expect(estimate.estimatedCostUsd).toBeNull();
    expect(formatEstimate(estimate, choice('openai', 'gpt-5.6-luna'))).toContain('cost unknown');
  });

  it('scales with bytes, not with file count', () => {
    const few = estimateFromScan({ files: 2, bytes: 400_000, truncated: false }, choice('openai', 'gpt-4.1-mini'));
    const many = estimateFromScan({ files: 2000, bytes: 40_000, truncated: false }, choice('openai', 'gpt-4.1-mini'));
    expect(few.estimatedCostUsd!).toBeGreaterThan(many.estimatedCostUsd!);
  });

  it('has no cost at all without a chosen model', () => {
    expect(estimateFromScan({ files: 1, bytes: 100, truncated: false }, null).estimatedCostUsd).toBeNull();
  });
});

describe('MODEL_ENV_VAR', () => {
  it('names the variable the naming pass actually reads', () => {
    // `cluster-only` resolves the backend default and ignores --model, so this
    // is the only lever on that pass.
    expect(MODEL_ENV_VAR.openai).toBe('GRAPHIFY_OPENAI_MODEL');
    expect(MODEL_ENV_VAR['claude-cli']).toBe('GRAPHIFY_CLAUDE_CLI_MODEL');
  });
});

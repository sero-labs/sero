import type { BuildEstimate, GraphifyBackend, ModelChoice, ModelPrice } from './types';

/**
 * Known prices, USD per 1M tokens.
 *
 * Deliberately short. Every entry here is copied from graphify's own pricing
 * table (`graphify/llm.py`, the numbers it uses for its `est. cost` line), so
 * Sero and the CLI agree on the models the CLI actually prices. Anything else
 * is **unknown**, and unknown is reported as unknown — a confident wrong number
 * is worse than no number when the user is deciding whether to spend.
 *
 * A user who knows the price of their own model supplies it on the
 * `ModelChoice` (`price`), which always wins over this table.
 */
const KNOWN_PRICES: Record<string, ModelPrice> = {
  'claude:claude-sonnet-4-6': { input: 3.0, output: 15.0 },
  'openai:gpt-4.1-mini': { input: 0.4, output: 1.6 },
  // The CLI backend runs on the user's Claude Code subscription: the plan pays,
  // not per-token API credit.
  'claude-cli': { input: 0, output: 0 },
};

export function priceFor(choice: ModelChoice): ModelPrice | null {
  if (choice.price) return choice.price;
  return KNOWN_PRICES[`${choice.backend}:${choice.modelId}`] ?? KNOWN_PRICES[choice.backend] ?? null;
}

export function costUsd(choice: ModelChoice, inputTokens: number, outputTokens: number): number | null {
  const price = priceFor(choice);
  if (!price) return null;
  return (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
}

/**
 * Bytes to tokens. Four bytes per token is the usual rough figure for English
 * prose and source alike; it is an estimate presented as one, and the estimate
 * only has to be good enough to catch an order-of-magnitude mistake before the
 * money is spent.
 */
export const BYTES_PER_TOKEN = 4;

/**
 * Extraction reads every file once and writes a much smaller graph. Output is
 * charged at a higher rate, so it cannot simply be ignored. A fifth of the
 * input is a little above the ratio the spike measured (45k in / 9k out), which
 * errs towards over-estimating — the safe direction for a spend guard.
 */
const OUTPUT_TOKEN_RATIO = 0.2;

/**
 * graphify 0.9.47 labels at most 100 communities per request. Each prompt row
 * contains up to 12 labels of 60 characters, and each response asks for a
 * short JSON name. These constants reserve the documented upper shape rather
 * than an invented percentage of the extraction cost.
 */
const NAMING_BATCH_SIZE = 100;
const NAMING_PROMPT_TOKENS_PER_BATCH = 100;
const NAMING_INPUT_TOKENS_PER_COMMUNITY = 200;
const NAMING_OUTPUT_TOKENS_PER_BATCH = 256;
const NAMING_OUTPUT_TOKENS_PER_COMMUNITY = 48;

export function estimateFromScan(
  scan: { files: number; bytes: number; truncated: boolean; unsupportedPatterns?: string[] },
  choice: ModelChoice | null,
): BuildEstimate {
  const estimatedInputTokens = Math.round(scan.bytes / BYTES_PER_TOKEN);
  const outputTokens = Math.round(estimatedInputTokens * OUTPUT_TOKEN_RATIO);
  return {
    files: scan.files,
    bytes: scan.bytes,
    truncated: scan.truncated,
    unsupportedPatterns: scan.unsupportedPatterns,
    estimatedInputTokens,
    estimatedOutputTokens: outputTokens,
    estimatedCostUsd: choice ? costUsd(choice, estimatedInputTokens, outputTokens) : null,
  };
}

/** Price the separate label pass from the community count already measured. */
export function estimateCommunityNaming(communities: number, choice: ModelChoice | null): BuildEstimate {
  const batches = Math.ceil(communities / NAMING_BATCH_SIZE);
  const estimatedInputTokens = communities * NAMING_INPUT_TOKENS_PER_COMMUNITY
    + batches * NAMING_PROMPT_TOKENS_PER_BATCH;
  const estimatedOutputTokens = communities * NAMING_OUTPUT_TOKENS_PER_COMMUNITY
    + batches * NAMING_OUTPUT_TOKENS_PER_BATCH;
  return {
    files: 0,
    bytes: 0,
    truncated: false,
    estimatedInputTokens,
    estimatedOutputTokens,
    estimatedCostUsd: choice ? costUsd(choice, estimatedInputTokens, estimatedOutputTokens) : null,
  };
}

export function formatUsd(value: number): string {
  return value < 0.01 && value > 0 ? '<$0.01' : `$${value.toFixed(2)}`;
}

export function formatEstimate(estimate: BuildEstimate, choice: ModelChoice | null): string {
  const mb = (estimate.bytes / (1024 * 1024)).toFixed(1);
  const tokens = `${Math.round(estimate.estimatedInputTokens / 1000)}k tokens`;
  const cost = estimate.estimatedCostUsd === null
    ? `cost unknown for ${choice ? choice.modelId : 'this model'}`
    : `~${formatUsd(estimate.estimatedCostUsd)}`;
  return `${estimate.files} files · ${mb} MB · ~${tokens} · ${cost}`;
}

export function formatCommunityNamingEstimate(
  communities: number,
  estimate: BuildEstimate,
  choice: ModelChoice,
): string {
  const cost = estimate.estimatedCostUsd === null
    ? `cost unknown for ${choice.modelId}`
    : `~${formatUsd(estimate.estimatedCostUsd)}`;
  const tokens = estimate.estimatedInputTokens + estimate.estimatedOutputTokens;
  return `${communities} communities · up to ~${Math.round(tokens / 1000)}k tokens · ${cost}`;
}

/**
 * A second way to name the model, belt to the `--model` flag's braces.
 *
 * Every entry is verified against the pinned graphifyy source: each is either a
 * backend's `model_env_key`, or a variable its `default_model` reads. `kimi`
 * has neither, so it has no entry — an invented variable would look like a
 * control and silently do nothing.
 *
 * `--model` is what actually pins both paid passes (extraction and community
 * naming) on the pinned version; this only covers a backend whose flag handling
 * changes underneath us.
 */
export const MODEL_ENV_VAR: Partial<Record<GraphifyBackend, string>> = {
  claude: 'ANTHROPIC_MODEL', // read by the backend's default_model
  'claude-cli': 'GRAPHIFY_CLAUDE_CLI_MODEL', // read directly by _call_claude_cli
  openai: 'GRAPHIFY_OPENAI_MODEL',
  gemini: 'GRAPHIFY_GEMINI_MODEL',
  deepseek: 'GRAPHIFY_DEEPSEEK_MODEL',
  ollama: 'OLLAMA_MODEL', // read by the backend's default_model
  // kimi: none exists upstream — `--model` is the only lever.
};

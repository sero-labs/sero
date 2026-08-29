interface SearchToolCall {
  name: string;
  args?: unknown;
  resultText?: string;
  durationMs?: number;
  resultTokensEstimate?: number;
}

interface SearchEvalContext {
  vars?: {
    expected_paths?: unknown;
    expected_terms?: unknown;
    unsupported_answer?: unknown;
    task_kind?: unknown;
  };
  providerResponse?: {
    metadata?: {
      searchMode?: 'bash' | 'fff' | 'graphify' | 'combined';
      toolCalls?: SearchToolCall[];
    };
  };
}

function normalizeExpectedValues(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === 'string');
  }
  if (typeof value !== 'string') return [];

  try {
    const parsed: unknown = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.filter((entry): entry is string => typeof entry === 'string');
    }
  } catch {
    // Promptfoo can render a one-item YAML array as its scalar value.
  }
  return [value];
}

function commandText(call: SearchToolCall): string {
  if (!call.args || typeof call.args !== 'object') return '';
  const command = (call.args as { command?: unknown }).command;
  return typeof command === 'string' ? command : '';
}

function isGraphifyCall(call: SearchToolCall): boolean {
  return call.name === 'sero-cli'
    && /(^|\n)\s*graphify_(query|search|path|explain)\b/.test(commandText(call));
}

export default function searchEvaluation(
  output: string,
  context: SearchEvalContext,
): { pass: boolean; score: number; reason: string } {
  const metadata = context.providerResponse?.metadata;
  const mode = metadata?.searchMode;
  const calls = metadata?.toolCalls ?? [];
  const searchCalls = calls.filter((call) => (
    ['bash', 'find', 'grep', 'multi_grep'].includes(call.name) || isGraphifyCall(call)
  ));
  const expectedValues = [
    ...normalizeExpectedValues(context.vars?.expected_paths),
    ...normalizeExpectedValues(context.vars?.expected_terms),
  ];
  const taskKind = typeof context.vars?.task_kind === 'string'
    ? context.vars.task_kind
    : 'ranked';
  const hasRanked = searchCalls.some((call) => ['find', 'grep', 'multi_grep'].includes(call.name));
  const hasBash = searchCalls.some((call) => call.name === 'bash');
  const hasGraphify = searchCalls.some(isGraphifyCall);

  const graphMode = mode === 'graphify' || mode === 'combined';
  const answerFound = expectedValues.every((expectedValue) => output.includes(expectedValue));
  const unsupportedAnswer = context.vars?.unsupported_answer;
  const handledUnsupported = typeof unsupportedAnswer === 'string'
    && output.includes(unsupportedAnswer);

  let usedExpectedTool: boolean;
  if (taskKind === 'exhaustive') {
    usedExpectedTool = hasBash;
  } else if (taskKind === 'cross_workspace' && !graphMode) {
    usedExpectedTool = searchCalls.length === 0;
  } else if (taskKind === 'graph' || taskKind === 'cross_workspace') {
    usedExpectedTool = graphMode
      ? hasGraphify
      : mode === 'fff'
        ? hasRanked || hasBash
        : hasBash;
  } else {
    usedExpectedTool = mode === 'fff' || mode === 'combined' ? hasRanked : hasBash;
  }
  const completed = taskKind === 'cross_workspace' && !graphMode
    ? handledUnsupported
    : answerFound;
  const resultTokens = searchCalls.reduce((sum, call) => sum + (call.resultTokensEstimate ?? 0), 0);
  const searchMs = searchCalls.reduce((sum, call) => sum + (call.durationMs ?? 0), 0);
  const pass = usedExpectedTool && completed;

  return {
    pass,
    score: pass ? 1 : 0,
    reason:
      `mode=${mode ?? 'unknown'} task=${taskKind} completed=${completed} answerFound=${answerFound} `
      + `expectedTool=${usedExpectedTool} `
      + `searchCalls=${searchCalls.length} resultTokens~=${resultTokens} searchMs=${searchMs}`,
  };
}

/**
 * Promptfoo assertion helper — checks that specific tools were called.
 *
 * Usage in scenario YAML:
 *   - type: javascript
 *     value: file://./eval/assertions/toolSequence.ts
 *     config:
 *       required: [write, read]
 *       forbidden: [bash]
 *
 * For file-based JS assertions, promptfoo calls the default export as:
 *   (output: string, context: { vars, prompt, test, providerResponse, ... })
 * Metadata lives at context.providerResponse.metadata.
 *
 * Promptfoo config plumbing can vary by assertion type/version, so read
 * config defensively from both context.config and context.test.options.config.
 */

interface AssertionConfig {
  /** Tools that must appear at least once */
  required?: string[];
  /** Tools that must NOT appear */
  forbidden?: string[];
  /** Exact ordered sequence (subset match) */
  orderedSubset?: string[];
}

interface PromptfooContext {
  vars?: Record<string, unknown>;
  test?: { assert?: unknown[]; options?: { config?: AssertionConfig } };
  providerResponse?: {
    metadata?: {
      toolCalls?: Array<{ name: string; args: unknown }>;
    };
  };
  config?: AssertionConfig;
}

interface AssertionResult {
  pass: boolean;
  score: number;
  reason: string;
}

function getAssertionConfig(context: PromptfooContext): AssertionConfig {
  return context.config ?? context.test?.options?.config ?? {};
}

export default function toolSequenceAssert(
  output: string,
  context: PromptfooContext,
): AssertionResult {
  void output;
  const meta = context.providerResponse?.metadata ?? {};
  const tools = meta.toolCalls?.map((t) => t.name) ?? [];
  const cfg = getAssertionConfig(context);
  const failures: string[] = [];

  if (cfg.required) {
    for (const name of cfg.required) {
      if (!tools.includes(name)) {
        failures.push(`missing required tool: ${name}`);
      }
    }
  }

  if (cfg.forbidden) {
    for (const name of cfg.forbidden) {
      if (tools.includes(name)) {
        failures.push(`used forbidden tool: ${name}`);
      }
    }
  }

  if (cfg.orderedSubset) {
    let idx = 0;
    for (const tool of tools) {
      if (idx < cfg.orderedSubset.length && tool === cfg.orderedSubset[idx]) {
        idx++;
      }
    }
    if (idx < cfg.orderedSubset.length) {
      failures.push(
        `ordered subset not found: expected [${cfg.orderedSubset.join(' → ')}], got [${tools.join(' → ')}]`,
      );
    }
  }

  const pass = failures.length === 0;
  return {
    pass,
    score: pass ? 1.0 : 0.0,
    reason: pass ? `Tools used: [${tools.join(', ')}]` : failures.join('; '),
  };
}

/**
 * Promptfoo assertion helper — checks that specific tools were called.
 *
 * Usage in scenario YAML:
 *   - type: javascript
 *     value: file://./eval/assertions/toolSequence.ts
 *     config:
 *       required: [write, read]
 *       forbidden: [bash]
 */

interface AssertionInput {
  output: string;
  metadata?: {
    toolCalls?: Array<{ name: string; args: unknown }>;
  };
  config?: {
    /** Tools that must appear at least once */
    required?: string[];
    /** Tools that must NOT appear */
    forbidden?: string[];
    /** Exact ordered sequence (subset match) */
    orderedSubset?: string[];
  };
}

interface AssertionResult {
  pass: boolean;
  score: number;
  reason: string;
}

export default function toolSequenceAssert(input: AssertionInput): AssertionResult {
  const tools = input.metadata?.toolCalls?.map((t) => t.name) ?? [];
  const cfg = input.config ?? {};
  const failures: string[] = [];

  // Check required tools
  if (cfg.required) {
    for (const name of cfg.required) {
      if (!tools.includes(name)) {
        failures.push(`missing required tool: ${name}`);
      }
    }
  }

  // Check forbidden tools
  if (cfg.forbidden) {
    for (const name of cfg.forbidden) {
      if (tools.includes(name)) {
        failures.push(`used forbidden tool: ${name}`);
      }
    }
  }

  // Check ordered subset
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

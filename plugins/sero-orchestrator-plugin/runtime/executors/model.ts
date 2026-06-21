/**
 * Model step executor — pure structured model call (no platform tools). When
 * the step declares an `outputSchema`, the schema is included in the prompt and
 * the returned text is parsed and validated; failures become a failed outcome
 * (FR-22). The current host API does not enforce schemas, so we validate here.
 */

import type { StepExecutor } from '../engine-types';
import type { StepOutcome } from '../../shared/types';
import { runStepAttempt } from './common';
import { extractJson } from '../schema';

export const modelExecutor: StepExecutor = {
  run(input) {
    const hasSchema = input.step.execution.type === 'model' && input.step.execution.outputSchema !== undefined;
    return runStepAttempt(input, {
      platformTools: 'none',
      refineOutcome: hasSchema ? validateSchemaOutput : undefined,
    });
  },
};

/** Ensures a schema'd model step returned a JSON object as its structured output. */
function validateSchemaOutput(response: string, parsed: StepOutcome | undefined): StepOutcome {
  const hasObject = (value: unknown): boolean => typeof value === 'object' && value !== null && !Array.isArray(value);
  const structured = parsed?.variables && Object.keys(parsed.variables).length > 0 ? parsed.variables : extractJson(response);
  if (!hasObject(structured)) {
    return { status: 'failed', summary: 'model step did not return valid JSON matching outputSchema' };
  }
  return parsed ?? { status: 'succeeded', summary: 'structured output produced', variables: structured as Record<string, unknown> };
}

/**
 * Background-agent step executor. Runs a standard Sero background agent in the
 * resolved loop workspace cwd. The agent receives the full Sero runtime tool
 * surface; Orchestrator adds no allowlist or approval layer (FR-09, FR-19).
 */

import type { StepExecutor } from '../engine-types';
import { runStepAttempt } from './common';

export const backgroundAgentExecutor: StepExecutor = {
  run(input) {
    return runStepAttempt(input, {
      platformTools: 'all',
      cwd: input.workspace?.cwd,
    });
  },
};

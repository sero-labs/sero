import type { ModelTier, ThinkingLevel } from '@sero-ai/common';

import type { ExecutionMode } from './record';

/**
 * Intake asks for an idea and then a place to work: a new folder the Architect
 * makes, or a workspace that already exists. Exactly one of `folder` and
 * `workspaceId` is required. Shared so the UI, the management tool and the
 * runtime keep one contract.
 */
export interface CreateProjectInput {
  idea: string;
  executionMode?: ExecutionMode;
  models?: { tier: ModelTier; model: string; thinking?: ThinkingLevel }[];
  /** New folder: the folder the Architect creates. */
  folder?: string;
  /** Existing workspace: the registered workspace the project works in. */
  workspaceId?: string;
}

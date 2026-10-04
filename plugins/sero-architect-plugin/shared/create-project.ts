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
  /**
   * The start cap in USD. With it the project runs under a delivery agreement:
   * the user approves the start once and no charter is proposed. Without it the
   * project uses the charter flow, which is deprecated.
   */
  capUsd?: number;
  executionMode?: ExecutionMode;
  openSpecEnabled?: boolean;
  models?: { tier: ModelTier; model: string; thinking?: ThinkingLevel }[];
  /** New folder: the folder the Architect creates. */
  folder?: string;
  /** Existing workspace: the registered workspace the project works in. */
  workspaceId?: string;
}

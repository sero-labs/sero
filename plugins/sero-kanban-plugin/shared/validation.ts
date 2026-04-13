/**
 * Kanban transition validation — canonical shared exports.
 *
 * The source of truth now lives in `@sero/common` so the host and plugin
 * consume the same state model and validation helpers.
 */

export type { ValidationResult } from '@sero/common';

export {
  validateCardTransition,
  validateReviewDecision,
  getUnmetDependencies,
  getManualMoveTargets,
  validateManualMove,
} from '@sero/common';

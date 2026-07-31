/**
 * The validation firewall (spec §8).
 *
 * One entry point, three families, in the order that makes the report useful: a
 * project that fails structurally cannot be resolved, so running the semantic
 * checks on it would report faults about pixels that were never going to exist.
 */

import { hasErrors, type Fault } from '../fault';
import type { PixelProject } from '../schema';
import { validateKind } from './kinds';
import { validateSemantics } from './semantic';
import { validateStructure } from './structural';

export interface Validation {
  faults: Fault[];
  /** True when nothing blocks a compile. Warnings do not block. */
  ok: boolean;
}

export function validateProject(project: PixelProject): Validation {
  const structural = validateStructure(project);
  if (hasErrors(structural)) return { faults: structural, ok: false };
  const faults = [...structural, ...validateSemantics(project), ...validateKind(project)];
  return { faults, ok: !hasErrors(faults) };
}

export { validateKind } from './kinds';
export { checkLockViolations, validateSemantics } from './semantic';
export { validateStructure } from './structural';

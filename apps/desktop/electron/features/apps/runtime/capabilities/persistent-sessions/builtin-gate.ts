/**
 * Built-in-only gate for `appRuntime.persistentSessions` (AD-029 §3.6).
 *
 * The gate itself is shared with every other gated capability — see
 * [../builtin-gate.ts](../builtin-gate.ts) for why a manifest declaration and an
 * "is installed" test are both insufficient. This file supplies only the
 * allowlist that is specific to persistent sessions.
 */

import {
  evaluateBuiltinAppGate,
  type BuiltinGateInput,
  type BuiltinGateResult,
} from '../builtin-gate';

export type { BuiltinGateInput, BuiltinGateResult } from '../builtin-gate';

/**
 * App ids permitted to hold the capability, each mapped to the directory name
 * it MUST occupy under the bundled plugins root. The mapping is what stops an
 * arbitrary directory claiming an allowlisted id.
 */
export const PERSISTENT_SESSION_BUILTIN_APPS: Readonly<Record<string, string>> = {
  orchestrator: 'sero-orchestrator-plugin',
};

export function evaluateBuiltinGate(input: BuiltinGateInput): BuiltinGateResult {
  return evaluateBuiltinAppGate(input, PERSISTENT_SESSION_BUILTIN_APPS);
}

export function isPersistentSessionBuiltin(input: BuiltinGateInput): boolean {
  return evaluateBuiltinGate(input).allowed;
}

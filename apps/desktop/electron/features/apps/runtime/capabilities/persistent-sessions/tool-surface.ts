/**
 * Which tools a managed session registers, and which of them start loaded.
 *
 * The registered set is the subject's whole approved tool list after the
 * permission profile. The request's tools only choose what starts loaded: the
 * rest are registered and deferred, so the agent can find one with
 * `tool_search` without a new approval. Validation already refuses a request
 * that names a tool outside the policy, so the loadout can never be wider than
 * the approval.
 */

import path from 'path';

import type { PersistentSessionSubjectPolicy } from '@sero-ai/common';

import { CODEMODE_TOOL_NAME } from '@electron/features/codemode';
import { isToolForSessionKind } from '@electron/features/plugins/bridge-policy';
import { getToolPackagePath } from '@electron/features/subagent/runtime/tool-catalog';
import type { UnavailableTool } from '@electron/features/tool-loadout';
import { applyPermissionProfile } from './permission-tools';

/** The one command surface every member needs from the first turn. It is never deferred. */
const ALWAYS_LOADED = 'sero-cli';

export interface MemberToolSurface {
  /** Everything the session registers: the approved list after the profile. */
  authorized: string[];
  /** What starts loaded. Always a subset of `authorized`. */
  loadout: string[];
  /** Approved tools the profile took away. */
  denied: string[];
}

export function resolveMemberToolSurface(
  policy: PersistentSessionSubjectPolicy,
  requested: string[],
): MemberToolSurface {
  const { allowed: authorized, removed: denied } = applyPermissionProfile(policy.allowedTools, policy.permissionProfile);
  const wanted = new Set(requested);
  const loadout = authorized.filter((name) => wanted.has(name) || name === ALWAYS_LOADED);
  return { authorized, loadout, denied };
}

/** Whether a member session can never have this tool, whatever the approval says. */
export function isWithheldFromMembers(name: string): boolean {
  // A member session never loads Code Mode.
  if (name === CODEMODE_TOOL_NAME) return true;
  const packagePath = getToolPackagePath(name);
  return !!packagePath && !isToolForSessionKind(path.join(packagePath, 'package.json'), name, 'member');
}

/**
 * Names every approved tool the session does not have, with the reason.
 *
 * Unsupported means this kind of session can never have the tool. Denied means
 * the permission profile took it away. Anything else that no loaded plugin
 * provides is unavailable, for instance a plugin that was uninstalled.
 */
export function classifyUnavailableTools(
  surface: MemberToolSurface,
  provided: ReadonlySet<string>,
): UnavailableTool[] {
  const unavailable: UnavailableTool[] = surface.denied.map((name) => ({
    name,
    reason: isWithheldFromMembers(name) ? 'unsupported' : 'denied',
  }));
  for (const name of surface.authorized) {
    if (provided.has(name)) continue;
    unavailable.push({ name, reason: isWithheldFromMembers(name) ? 'unsupported' : 'unavailable' });
  }
  return unavailable;
}

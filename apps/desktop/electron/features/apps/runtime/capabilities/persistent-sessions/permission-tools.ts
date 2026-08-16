/**
 * Turning a permission profile into an actual tool surface.
 *
 * The profile is the coarse axis of what a session may do; `allowedTools` is the
 * fine one. Validation already checks the fine axis, but a profile that affects
 * nothing is decorative — a subject approved as `filesystem: 'read'` would still
 * hold `write` if its tool list happened to include it, and the user was shown
 * "read only".
 *
 * So the profile is applied as a SECOND filter, after the tool allowlist. The
 * two must agree, and where they disagree the profile wins, because that is
 * what the approval dialog described.
 */

import type { PersistentSessionPermissionProfile } from '@sero-ai/common';

/**
 * Tool names grouped by the capability they actually confer. Names are matched
 * case-insensitively against both the exact name and common prefixes, because
 * plugin tools are bridged under their own names and a new one must fail
 * CLOSED — an unrecognised tool is not silently treated as harmless.
 */
const WRITE_TOOLS = ['write', 'edit', 'apply_patch', 'multi_edit', 'notebook_edit'];
const COMMAND_TOOLS = ['bash', 'shell', 'run_command', 'terminal'];
const NETWORK_TOOLS = ['fetch', 'fetch_content', 'web_search', 'browser', 'automation_browser', 'curl'];
const VCS_WRITE_TOOLS = ['git_push', 'gh', 'git_commit', 'create_pr'];
const VCS_COMMIT_TOOLS = ['git_commit'];
const READ_TOOLS = ['read', 'read_file', 'read_files', 'cat', 'ls', 'list_files', 'tree', 'find', 'glob', 'grep', 'ripgrep', 'file_search'];
const ROOM_PROTOCOL_TOOLS = ['sero-cli'];

function matches(tool: string, group: readonly string[]): boolean {
  const name = tool.toLowerCase();
  return group.some((candidate) => name === candidate || name.startsWith(`${candidate}_`));
}

/**
 * Filters an already-allowlisted tool set down to what the profile permits.
 *
 * Returns the removed names too, so a denial is explainable: "the reviewer was
 * approved read-only, so `write` was removed" is a useful diagnostic, and a
 * silent removal would look like a bug to whoever wrote the blueprint.
 */
export function applyPermissionProfile(
  tools: string[],
  profile: PersistentSessionPermissionProfile,
): { allowed: string[]; removed: string[] } {
  const permitted = (tool: string): boolean => {
    if (matches(tool, WRITE_TOOLS)) return profile.filesystem === 'write';
    if (matches(tool, COMMAND_TOOLS)) return profile.commands === 'all';
    if (matches(tool, NETWORK_TOOLS)) return profile.network !== 'none';
    if (matches(tool, VCS_COMMIT_TOOLS)) return profile.vcs === 'commit' || profile.vcs === 'push';
    if (matches(tool, VCS_WRITE_TOOLS)) return profile.vcs === 'push';
    if (matches(tool, READ_TOOLS)) return profile.filesystem !== 'none';
    if (matches(tool, ROOM_PROTOCOL_TOOLS)) return true;
    return false;
  };

  const allowed = tools.filter(permitted);
  return { allowed, removed: tools.filter((tool) => !allowed.includes(tool)) };
}

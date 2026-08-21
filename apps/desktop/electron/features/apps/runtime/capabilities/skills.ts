/**
 * Wiring for `appRuntime.skills` (spec 18 — skill extraction).
 *
 * A skill file is prompt content loaded into every agent session, so writing one
 * is a real privilege. Three things guard it, and all three live here in the
 * host, never in the calling plugin:
 *
 *   1. the built-in gate — a runtime that does not pass it has no `host.skills`
 *      at all, so declaring `appRuntime.skills` in a manifest achieves nothing;
 *   2. a renderer-issued, content-bound, one-time approval — the plugin's own
 *      actions are reachable by a model, so a write no person approved in the
 *      app is refused here (see write-approvals.ts);
 *   3. the host resolves the target path itself, from the skills it discovered.
 *      A caller supplies a name; it never supplies a path.
 *
 * The file mechanics are NOT reimplemented here — they come from the shared
 * skill store, so a runtime write and an Admin write cannot drift apart.
 */

import type {
  AppRuntimeSkillSummary,
  AppRuntimeSkillWrite,
  AppRuntimeSkillWriteResult,
  AppRuntimeSkillsApi,
} from '@sero-ai/common';

import {
  VALID_SKILL_NAME,
  listUserSkills,
  writeSkillFile,
} from '@electron/features/skills/store';
import { consumeSkillWriteApproval, skillContentHash } from '@electron/features/skills/write-approvals';
import { reloadAllSessionResources } from '@electron/ipc/agent/core/agent';

import { evaluateBuiltinAppGate } from './builtin-gate';
import type { AppRuntimeTarget } from '../types';

/**
 * App ids permitted to hold the capability, each mapped to the directory name it
 * MUST occupy under the bundled plugins root.
 */
export const SKILL_WRITE_BUILTIN_APPS: Readonly<Record<string, string>> = {
  orchestrator: 'sero-orchestrator-plugin',
};

/**
 * Where a skill of this name already lives, according to host discovery.
 *
 * Discovery is recursive and a skill's `name` comes from its frontmatter, so the
 * existing file is often NOT `<skills>/<name>/SKILL.md` — a nested skill, or one
 * whose directory differs from its declared name, would otherwise be "replaced"
 * by writing a second file and leaving the original in place, giving two skills
 * the same name.
 */
function resolveExisting(name: string): { filePath: string } | 'none' | 'ambiguous' {
  const matches = listUserSkills().filter((skill) => skill.name === name);
  if (matches.length === 0) return 'none';
  if (matches.length > 1) return 'ambiguous';
  return { filePath: matches[0].filePath };
}

export function createSkillsApi(): AppRuntimeSkillsApi {
  return {
    async list(): Promise<AppRuntimeSkillSummary[]> {
      return listUserSkills().map(({ name, description, filePath }) => ({ name, description, filePath }));
    },

    async write(skill: AppRuntimeSkillWrite): Promise<AppRuntimeSkillWriteResult> {
      if (!VALID_SKILL_NAME.test(skill.name)) {
        throw new Error(
          `Invalid skill name '${skill.name}'. Use only lowercase letters, numbers, and hyphens.`,
        );
      }
      if (!skill.description.trim()) throw new Error('A skill needs a description — it is its trigger text.');
      if (!skill.body.trim()) throw new Error('A skill needs a body.');

      // Before anything is resolved or written: was this exact content approved
      // by a person in the app? A model calling the plugin's action reaches here
      // with no approval and stops.
      const approved = consumeSkillWriteApproval(
        skill.approval.scope,
        skillContentHash({ name: skill.name, description: skill.description, body: skill.body }),
      );
      if (!approved) {
        throw new Error('This skill write was not approved in the app. Review and save the draft there.');
      }

      const existing = resolveExisting(skill.name);
      if (existing === 'ambiguous') {
        throw new Error(`More than one skill is named '${skill.name}'. Rename this one, or tidy the duplicates first.`);
      }
      if (existing !== 'none' && !skill.overwrite) {
        throw new Error(`A skill named '${skill.name}' already exists.`);
      }

      // Replacing writes over the file discovery actually found; a new skill goes
      // to the canonical path the host derives from the validated name.
      const filePath = await writeSkillFile({
        name: skill.name,
        description: skill.description,
        extraFrontmatter: skill.origin ? { origin: skill.origin } : {},
        body: skill.body,
        filePath: existing === 'none' ? undefined : existing.filePath,
      });

      reloadAllSessionResources().catch((err) =>
        console.error('[skills] reloadAllSessionResources failed:', err),
      );

      return { filePath, created: existing === 'none' };
    },
  };
}

/**
 * Returns the capability, or null when this app is not a permitted bundled
 * plugin. A null return is the enforcement — the runtime simply has no method
 * to call.
 */
export async function installSkills(
  target: AppRuntimeTarget,
): Promise<AppRuntimeSkillsApi | null> {
  const gate = evaluateBuiltinAppGate(
    { appId: target.manifest.id, packagePath: target.manifest.packagePath },
    SKILL_WRITE_BUILTIN_APPS,
  );
  if (!gate.allowed) {
    if (gate.reason !== 'app-not-allowlisted') {
      console.warn(`[skills] capability refused for ${target.manifest.id}: ${gate.reason}`);
    }
    return null;
  }
  return createSkillsApi();
}

/**
 * Wiring for `appRuntime.skills` (spec 18 — skill extraction).
 *
 * A skill file is prompt content loaded into every agent session, so writing one
 * is a real privilege. This is where that is enforced: a runtime that does not
 * pass the built-in gate never receives the capability, so its `host.skills` is
 * simply `undefined`. Declaring `appRuntime.skills` in a manifest achieves
 * nothing.
 *
 * The file mechanics are NOT reimplemented here — they come from the shared
 * skill store, so a runtime write and an Admin write cannot drift apart.
 */

import { access } from 'fs/promises';

import type {
  AppRuntimeSkillSummary,
  AppRuntimeSkillWrite,
  AppRuntimeSkillWriteResult,
  AppRuntimeSkillsApi,
} from '@sero-ai/common';

import {
  VALID_SKILL_NAME,
  listUserSkills,
  skillFilePath,
  writeSkillFile,
} from '@electron/features/skills/store';
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

async function exists(filePath: string): Promise<boolean> {
  return access(filePath).then(() => true, () => false);
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

      const targetPath = skillFilePath(skill.name);
      const existed = await exists(targetPath);
      if (existed && !skill.overwrite) {
        throw new Error(`A skill named '${skill.name}' already exists.`);
      }

      // No filePath is passed: the store derives the target from the validated
      // name, which is what makes a traversal impossible rather than merely
      // checked for.
      const filePath = await writeSkillFile({
        name: skill.name,
        description: skill.description,
        extraFrontmatter: skill.origin ? { origin: skill.origin } : {},
        body: skill.body,
      });

      reloadAllSessionResources().catch((err) =>
        console.error('[skills] reloadAllSessionResources failed:', err),
      );

      return { filePath, created: !existed };
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

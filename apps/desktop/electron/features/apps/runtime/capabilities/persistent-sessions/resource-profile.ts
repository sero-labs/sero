/**
 * The filtered member resource profile (AD-029 §5).
 *
 * A managed persistent session sits between a full interactive chat and an
 * isolated completion. A chat loads every installed extension, prompt template,
 * theme and agent definition — far more authority and context than an agent the
 * user approved for one narrow job should carry.
 *
 * The host builds this loader FROM THE GRANT. The request supplies no loader
 * overrides, so a plugin cannot widen its own resource profile.
 */

import { DefaultResourceLoader } from '@earendil-works/pi-coding-agent';
import type { LoadExtensionsResult, SettingsManager } from '@earendil-works/pi-coding-agent';

import { SERO_AGENT_DIR } from '@electron/platform/env';

/** The SDK does not export its options type, so derive it from the constructor. */
type LoaderOptions = ConstructorParameters<typeof DefaultResourceLoader>[0];
export interface MemberResourceProfileInput {
  cwd: string;
  /** Skills the blueprint selected, already intersected with the grant. */
  allowedSkills: string[];
  /** Appended AFTER the base prompt and host-required blocks. Never replaces them. */
  appendSystemPrompt: string[];
  settingsManager: SettingsManager;
  /**
   * Only extensions that provide an approved capability, plus the AD-020
   * `sero-cli` bridge. The caller assembles these from the grant.
   */
  extensionFactories: NonNullable<LoaderOptions['extensionFactories']>;
  /**
   * The packages this session loads extensions from — nothing else is
   * discovered. Same form as a `packages` entry in settings: a path or spec,
   * not a file inside the package.
   *
   * A member is given the extensions of the app that holds its grant, and no
   * others. Every installed plugin loading into a member session would put
   * every plugin's commands on its `sero-cli` surface, which is authority
   * nobody approved and prompt the member has no use for.
   */
  packages: string[];
  /** Bridges plugin tools into the single `sero-cli` tool (AD-020). */
  bridgeExtensions(base: LoadExtensionsResult): LoadExtensionsResult;
}

/**
 * Loads: project context files, the approved prompt additions,
 * blueprint-selected skills, and the approved extensions including the AD-020
 * bridge.
 *
 * Does not load: prompt templates, themes, agent definitions, or any extension
 * outside the approved set — which also keeps third-party session-lifecycle
 * hooks out. Persistence stays Pi `SessionManager`'s job and never depends on a
 * plugin hook.
 *
 * Returns a LOADED loader. `createAgentSession` only loads a loader it built
 * itself, so a caller's loader that was never told to load hands the session an
 * empty extension set — no tools, no commands, no bridge — and nothing about
 * the session says so.
 */
export async function createMemberResourceLoader(
  input: MemberResourceProfileInput,
): Promise<DefaultResourceLoader> {
  const allowedSkills = new Set(input.allowedSkills);

  const loader = new DefaultResourceLoader({
    cwd: input.cwd,
    agentDir: SERO_AGENT_DIR,
    settingsManager: input.settingsManager,
    extensionFactories: input.extensionFactories,
    // Discovery off, then exactly the approved packages back on.
    noExtensions: true,
    additionalExtensionPaths: input.packages,
    appendSystemPrompt: input.appendSystemPrompt,
    // A member runs one approved prompt, not a library of user-authored ones.
    noPromptTemplates: true,
    // A background session renders nothing, so a theme is pure surface area.
    noThemes: true,
    // Project context files stay ON: a member that cannot read AGENTS.md would
    // ignore the repository's own rules.
    noContextFiles: false,
    skillsOverride: (base) => ({
      ...base,
      skills: base.skills.filter((skill) => allowedSkills.has(skill.name)),
    }),
    extensionsOverride: (base: LoadExtensionsResult) => input.bridgeExtensions(base),
  });

  await loader.reload();
  return loader;
}

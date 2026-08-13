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
import type {
  LoadExtensionsResult,
  SettingsManager,
  Skill,
} from '@earendil-works/pi-coding-agent';

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
 */
export function createMemberResourceLoader(input: MemberResourceProfileInput): DefaultResourceLoader {
  const allowedSkills = new Set(input.allowedSkills);

  return new DefaultResourceLoader({
    cwd: input.cwd,
    agentDir: SERO_AGENT_DIR,
    settingsManager: input.settingsManager,
    extensionFactories: input.extensionFactories,
    appendSystemPrompt: input.appendSystemPrompt,
    // A member runs one approved prompt, not a library of user-authored ones.
    noPromptTemplates: true,
    // A background session renders nothing, so a theme is pure surface area.
    noThemes: true,
    // Project context files stay ON: a member that cannot read AGENTS.md would
    // ignore the repository's own rules.
    noContextFiles: false,
    skillsOverride: (base: { skills: Skill[]; diagnostics: DiagnosticList }) => ({
      ...base,
      skills: base.skills.filter((skill) => allowedSkills.has(skill.name)),
    }),
    extensionsOverride: (base: LoadExtensionsResult) => input.bridgeExtensions(base),
  });
}

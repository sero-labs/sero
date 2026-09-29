/** Skill catalogue types for the Admin bridge. Kept apart so admin-bridge.ts stays under the file size limit. */

export type SkillScopeIPC = 'user' | 'plugin' | 'project';

export interface SkillCatalogueEntryIPC {
  name: string;
  description: string;
  filePath: string;
  scope: SkillScopeIPC;
  /** `user`, the plugin's short name, or the workspace id for a project skill. */
  origin: string;
  disableModelInvocation: boolean;
}

export interface SkillCatalogueIPC {
  skills: SkillCatalogueEntryIPC[];
  /** Workspaces with at least one project skill. */
  projects: Array<{ id: string; name: string }>;
}

export type OpenShellPolicyProfileId =
  | 'strict'
  | 'dev'
  | 'browser-agent'
  | 'gpu-agent'
  | 'plugin-test';

export interface OpenShellPolicyProfile {
  id: OpenShellPolicyProfileId;
  label: string;
  summary: string;
  filesystemAccess: readonly string[];
  networkAccess: readonly string[];
  processAccess: readonly string[];
  staticBoundaries: readonly string[];
  hotReloadableBoundaries: readonly string[];
  sandboxRecreationRequiredFor: readonly string[];
  unsupportedInCurrentCli: readonly string[];
}

export interface OpenShellPolicyProfileHistoryEntry {
  profileId: OpenShellPolicyProfileId;
  changedAt: string;
  message: string;
}

export const OPENSHELL_POLICY_PROFILE_HISTORY_LIMIT = 20;

export const DEFAULT_OPENSHELL_POLICY_PROFILE_ID: OpenShellPolicyProfileId = 'dev';

export const OPENSHELL_POLICY_PROFILES: readonly OpenShellPolicyProfile[] = [
  {
    id: 'strict',
    label: 'Strict',
    summary: 'Minimal Sero policy intent for review and low-trust tasks with narrow workspace access.',
    filesystemAccess: [
      'Workspace read/write under /sandbox/workspace/<name> only when explicitly synced by Sero.',
      'No intended access to host paths or credentials outside the sandbox workspace.',
    ],
    networkAccess: [
      'Deny-by-default network intent; allow only Sero-required control plane endpoints when templates exist.',
      'Exact endpoint enforcement is not applied by current Sero OpenShell Local integration.',
    ],
    processAccess: [
      'Non-privileged commands inside the sandbox only.',
      'No interactive OpenShell PTY, privileged containers, or host process access in current Sero integration.',
    ],
    staticBoundaries: [
      'Filesystem/Landlock boundaries require sandbox creation-time policy.',
      'Process and privilege boundaries require sandbox creation-time policy.',
    ],
    hotReloadableBoundaries: [
      'Network endpoint policy can be hot-reloaded by OpenShell policy update when Sero supports templates.',
    ],
    sandboxRecreationRequiredFor: [
      'Filesystem access changes',
      'Process policy changes',
      'Privilege boundary changes',
    ],
    unsupportedInCurrentCli: [
      'Sero does not yet compile this profile to OpenShell policy YAML.',
      'Prompt-driven allow/deny decisions are not supported by current Sero OpenShell Local integration.',
    ],
  },
  {
    id: 'dev',
    label: 'Dev',
    summary: 'Developer workflow profile for package installs, GitHub, and local dev servers.',
    filesystemAccess: [
      'Workspace read/write under /sandbox/workspace/<name>.',
      'No intended access to host paths outside the synced workspace.',
    ],
    networkAccess: [
      'Package registries, GitHub, and local dev server ports are intended for normal development.',
      'Exact endpoint enforcement is not applied by current Sero OpenShell Local integration.',
    ],
    processAccess: [
      'Normal shell commands inside the sandbox for build, test, package manager, and Git workflows.',
      'No interactive OpenShell PTY or host process access in current Sero integration.',
    ],
    staticBoundaries: [
      'Filesystem/Landlock boundaries require sandbox creation-time policy.',
      'Process and privilege boundaries require sandbox creation-time policy.',
    ],
    hotReloadableBoundaries: [
      'Network endpoint policy can be hot-reloaded by OpenShell policy update when Sero supports templates.',
      'Forwarded dev server port policy is expected to be adjustable without recreating the sandbox.',
    ],
    sandboxRecreationRequiredFor: [
      'Filesystem access changes',
      'Process policy changes',
      'GPU resource changes',
    ],
    unsupportedInCurrentCli: [
      'Sero does not yet compile this profile to OpenShell policy YAML.',
      'Sero policy intent is stored and displayed, but not applied by current Sero OpenShell Local integration.',
    ],
  },
  {
    id: 'browser-agent',
    label: 'Browser Agent',
    summary: 'Browser automation intent for web QA, scraping, and visual checks with explicit network scope.',
    filesystemAccess: [
      'Workspace read/write under /sandbox/workspace/<name>.',
      'Browser cache, downloads, and screenshots are intended to stay inside sandbox-managed workspace paths.',
    ],
    networkAccess: [
      'Target web origins, package registries, and browser dependency downloads are intended when declared.',
      'Exact browser-origin enforcement is not applied by current Sero OpenShell Local integration.',
    ],
    processAccess: [
      'Browser and automation driver processes are intended inside the sandbox only.',
      'No host browser automation, host process access, or interactive OpenShell PTY in current Sero integration.',
    ],
    staticBoundaries: [
      'Browser binary, filesystem, and process boundaries require sandbox creation-time policy.',
      'Shared memory, device, and privilege boundaries require sandbox creation-time policy.',
    ],
    hotReloadableBoundaries: [
      'Network endpoint policy can be hot-reloaded by OpenShell policy update when Sero supports templates.',
      'Allowed target origins are expected to be a hot-reloadable network boundary once enforcement exists.',
    ],
    sandboxRecreationRequiredFor: [
      'Filesystem access changes',
      'Browser dependency or device boundary changes',
      'Process policy changes',
    ],
    unsupportedInCurrentCli: [
      'Sero does not yet compile this profile to OpenShell policy YAML.',
      'Browser automation enablement is profile intent only; current Sero OpenShell Local integration does not provision browser-specific policy.',
    ],
  },
  {
    id: 'gpu-agent',
    label: 'GPU Agent',
    summary: 'GPU workload intent for model, media, or compute tasks that need explicit device boundaries.',
    filesystemAccess: [
      'Workspace read/write under /sandbox/workspace/<name>.',
      'Model artifacts, caches, and generated media are intended to remain inside sandbox-managed workspace paths.',
    ],
    networkAccess: [
      'Model registries, package registries, and declared artifact endpoints are intended when templates exist.',
      'Exact endpoint enforcement is not applied by current Sero OpenShell Local integration.',
    ],
    processAccess: [
      'GPU and compute processes are intended inside the sandbox with explicit device/resource policy.',
      'No host process access, privileged device escape, or interactive OpenShell PTY in current Sero integration.',
    ],
    staticBoundaries: [
      'GPU device, filesystem, and process boundaries require sandbox creation-time policy.',
      'Resource and privilege boundaries require sandbox creation-time policy.',
    ],
    hotReloadableBoundaries: [
      'Network endpoint policy can be hot-reloaded by OpenShell policy update when Sero supports templates.',
    ],
    sandboxRecreationRequiredFor: [
      'GPU resource changes',
      'Filesystem access changes',
      'Process or privilege policy changes',
    ],
    unsupportedInCurrentCli: [
      'Sero does not yet compile this profile to OpenShell policy YAML.',
      'GPU runtime enablement is profile intent only; current Sero OpenShell Local integration does not provision GPU policy.',
    ],
  },
  {
    id: 'plugin-test',
    label: 'Plugin Test',
    summary: 'Plugin validation intent for exercising Sero plugins with constrained workspace and network scope.',
    filesystemAccess: [
      'Workspace read/write under /sandbox/workspace/<name>.',
      'Plugin fixtures and generated test outputs are intended to stay inside sandbox-managed workspace paths.',
    ],
    networkAccess: [
      'Package registries, GitHub, and declared plugin provider test endpoints are intended when templates exist.',
      'Exact provider endpoint enforcement is not applied by current Sero OpenShell Local integration.',
    ],
    processAccess: [
      'Build, test, and plugin development commands are intended inside the sandbox.',
      'No host plugin execution, host process access, or interactive OpenShell PTY in current Sero integration.',
    ],
    staticBoundaries: [
      'Filesystem/Landlock boundaries require sandbox creation-time policy.',
      'Process and privilege boundaries require sandbox creation-time policy.',
    ],
    hotReloadableBoundaries: [
      'Network endpoint policy can be hot-reloaded by OpenShell policy update when Sero supports templates.',
      'Declared provider test endpoints are expected to be hot-reloadable once enforcement exists.',
    ],
    sandboxRecreationRequiredFor: [
      'Filesystem access changes',
      'Process policy changes',
      'Plugin runtime privilege boundary changes',
    ],
    unsupportedInCurrentCli: [
      'Sero does not yet compile this profile to OpenShell policy YAML.',
      'Plugin-specific allow/deny prompts are not supported by current Sero OpenShell Local integration.',
    ],
  },
];

export function getOpenShellPolicyProfile(id?: string): OpenShellPolicyProfile {
  const selected = OPENSHELL_POLICY_PROFILES.find((profile) => profile.id === id);
  return selected ?? getDefaultOpenShellPolicyProfile();
}

export function getDefaultOpenShellPolicyProfile(): OpenShellPolicyProfile {
  const defaultProfile = OPENSHELL_POLICY_PROFILES.find(
    (profile) => profile.id === DEFAULT_OPENSHELL_POLICY_PROFILE_ID,
  );

  if (!defaultProfile) {
    throw new Error('Default OpenShell policy profile is missing from the shared catalog.');
  }

  return defaultProfile;
}

export function isOpenShellPolicyProfileId(value: string): value is OpenShellPolicyProfileId {
  return OPENSHELL_POLICY_PROFILES.some((profile) => profile.id === value);
}

/**
 * Installs `appRuntime.persistentSessions` on a runtime host (AD-029).
 *
 * Split from create-host.ts so that file stays within the 500-line limit and so
 * the Pi-facing assembly (resource loader, model resolution, approval) lives
 * next to the capability it serves.
 *
 * The gate runs here, against the FINAL discovered manifest. `discoverApps()`
 * de-duplicates by app id with last-write-wins, so an earlier source can be
 * overridden; gating on the manifest the runtime actually loads is what makes
 * that ordering irrelevant.
 */

import { modelKey, type PersistentSessionGrantProposal, type PersistentSessionsApi } from '@sero-ai/common';
import { existsSync, realpathSync } from 'fs';
import type { CreateAgentSessionOptions, LoadExtensionsResult } from '@earendil-works/pi-coding-agent';

import { ensureAiInfra } from '@electron/shared/infra/ai-infra';
import { requestChoice } from '@electron/platform/desktop/request-choice';
import { bridgeExtensionTools, createPrivateCliRegistry, createWorkspaceCliTool } from '@electron/cli';
import { dropToolsNotForSessionKind } from '@electron/features/plugins/bridge-policy';
import { createSeroExtensionFactory } from '@electron/features/apps/extensions/create-sero-extension';
import {
  restrictSearchToolOrigins,
  searchPluginPackages,
} from '@electron/features/apps/extensions/search-plugin';
import { workspaceManager } from '@electron/features/workspace/manager';
import { toRuntimeCwd } from '@electron/features/workspace/runtime/runtime-paths';
import { runtimeManager } from '@electron/features/workspace/runtime/runtime-manager';
import { containerPromptState } from '@electron/features/container/tools/container-prompt-state';
import { getToolCatalogFor, getToolPackagePath, warmSubagentToolCatalog } from '@electron/features/subagent/runtime/tool-catalog';
import { packageRootForResourcePath } from '@electron/features/plugins/resource-compatibility';
import { getRoomSkillCatalog } from '@electron/ipc/agent/handlers/subagent-context';

import { clampProposal, describeGrantAuthority } from './clamp';
import { fitsDelegationPolicy, type DelegationLink } from './delegation-policy';
import { applyPermissionProfile } from './permission-tools';
import { createMemberRuntimeTools } from './member-runtime-tools';
import { createMemberResourceLoader } from './resource-profile';
import { createPersistentSessionsApi } from './index';
import type { AppRuntimeTarget } from '../../types';

/**
 * Clamps a proposal to what the user actually holds, then asks for approval.
 *
 * Clamping first is the point: the user is asked to approve the CLAMPED set, so
 * the thing they see and the thing the host stores are the same object. A
 * proposal is an input to this decision, never a source of authority.
 */
export async function clampAndApprove(
  workspaceId: string,
  proposal: PersistentSessionGrantProposal,
  link?: DelegationLink,
): Promise<{ approvalId: string; approved: PersistentSessionGrantProposal; delegatedByPolicyId?: string } | null> {
  const { modelRuntime } = await ensureAiInfra();
  const [models, workspaces, toolCatalog, skills] = await Promise.all([
    modelRuntime.getAvailable(),
    workspaceManager.list(),
    // A tool that no member session of this kind can get is not offered.
    warmSubagentToolCatalog().then(() => getToolCatalogFor('member')),
    getRoomSkillCatalog(workspaceId),
  ]);

  // The workspace id binds the session's CLI tool and extension. An id the host
  // cannot resolve would pass every other clamp and leave the member with a
  // tool that answers "Workspace not found" on every call.
  const workspace = workspaces.find((candidate) => candidate.id === workspaceId);
  if (!workspace) {
    console.warn(`[persistent-sessions] grant refused: workspace ${workspaceId} is not registered`);
    return null;
  }

  // Every field is verified against something real. A proposal field the host
  // cannot resolve is dropped, never trusted — see clamp.ts.
  const { proposal: clamped, notes } = clampProposal(proposal, {
    // Only the root of the proposal's OWN workspace. Every other registered
    // root would let the grant bind a cwd in a workspace the dialog never
    // named, so the approval and the stored grant would describe different
    // places.
    workspaceRoots: [workspace.path],
    // The same provider-qualified identity the caller names a model by.
    availableModels: new Set(models.map((model) => modelKey(model.provider, model.id))),
    availableTools: new Set(toolCatalog.map((tool) => tool.name)),
    // Use the same workspace catalogue that planning receives. A skill that
    // can be selected there must survive approval here and load in the member.
    availableSkills: new Set(skills.map((skill) => skill.name)),
    // The ceiling this build permits a managed session. Nothing here can grant
    // authority the user does not already hold in the workspace.
    permissionCeiling: { filesystem: 'write', commands: 'all', network: 'fetch', vcs: 'push' },
  });

  // A linked proposal inside a stored policy is access the user already
  // approved, so it is recorded without another dialog. The check runs on the
  // CLAMPED proposal against the policy the host stored. Anything that does
  // not fit takes the dialog below, like every other grant.
  if (link) {
    const fit = fitsDelegationPolicy(clamped, link);
    if (fit.ok) {
      // A grant issued under a policy passes nothing further on.
      const { delegation: _dropped, ...approved } = clamped;
      return { approvalId: link.policy.approvalId, approved, delegatedByPolicyId: link.policy.policyId };
    }
    console.warn(`[persistent-sessions] policy ${link.policy.policyId} does not cover this grant: ${fit.reason}`);
  }

  const authority = describeGrantAuthority(clamped);
  const delegation = clamped.delegation;
  // The same consent rule as above: each role is shown as authority, in words.
  const delegationLines = delegation && delegation.delegateAppIds.length > 0 ? [
    '',
    'Agents it starts later can do this without another question:',
    ...Object.entries(delegation.roles).map(([role, policy]) =>
      `• ${role}: ${describeGrantAuthority({ subjects: { [role]: policy } }).join('; ') || 'nothing'}`),
    `Up to ${delegation.maxLiveSessions} of them at once, ${delegation.maxTotalSessions} in total.`,
  ] : [];
  const memberCount = Object.keys(clamped.subjects).length;
  const droppedNote = notes.length > 0
    ? `\n\nNot available under this approval, so removed: ${notes.map((note) => note.dropped.join(', ')).join('; ')}`
    : '';

  const choice = await requestChoice({
    title: 'Allow persistent agent sessions?',
    // The user must see the AUTHORITY, not just a count. A dialog that says
    // "3 agents" is consent to a number, not to a capability.
    body: [
      clamped.reason,
      '',
      `${memberCount} agent${memberCount === 1 ? '' : 's'}, up to ${clamped.maxLiveSessions} running at once.`,
      '',
      'They will be able to:',
      ...authority.map((line) => `• ${line}`),
      ...delegationLines,
    ].join('\n') + droppedNote,
    choices: [
      { id: 'allow', label: 'Allow' },
      { id: 'deny', label: 'Not now' },
    ],
    // Without this the card offers to continue by itself, which is the opposite
    // of what silence does to a consent question.
    fallbackLabel: 'nothing starts',
    timeoutMs: 120_000,
  });

  // A timeout is a denial. Silence must never widen authority — but it is not
  // the same as a refusal, and the caller has to be able to say which happened.
  if (choice.timedOut) throw new Error('nobody answered the request to allow agent sessions');
  if (choice.choiceId !== 'allow') return null;

  // The dialog approved this grant alone, so the named policy does not bind it.
  const { delegationPolicyId: _unused, ...approved } = clamped;
  return { approvalId: `approval_${Date.now().toString(36)}`, approved };
}

/** The plugin packages, beyond `basePackages`, that register an approved tool. */
function approvedToolPackages(allowedTools: string[], basePackages: string[]): string[] {
  // A plugin removed since the catalogue was built is reported as not provided.
  const candidates = new Set(
    allowedTools.flatMap((name) => {
      const packagePath = getToolPackagePath(name);
      return packagePath && existsSync(packagePath) ? [packagePath] : [];
    }),
  );
  if (candidates.size === 0) return [];
  const known = new Set(basePackages.map((packagePath) => realpathSync(packagePath)));
  return [...candidates].filter((packagePath) => !known.has(realpathSync(packagePath)));
}

/**
 * A plugin loaded only for its approved tools keeps just those tools. The rest
 * of its tools were never approved for this member.
 */
function keepApprovedTools(
  base: LoadExtensionsResult,
  allowedTools: string[],
  approvedPackages: string[],
): LoadExtensionsResult {
  const roots = new Set(approvedPackages.map((packagePath) => realpathSync(packagePath)));
  for (const extension of base.extensions) {
    const root = packageRootForResourcePath(extension.resolvedPath);
    if (!root || !roots.has(realpathSync(root))) continue;
    for (const name of [...extension.tools.keys()]) {
      if (!allowedTools.includes(name)) extension.tools.delete(name);
    }
    extension.commands.clear();
  }
  return base;
}

/**
 * Returns the capability, or null when this app is not a permitted bundled
 * plugin. A null return is the enforcement — the runtime simply has no method
 * to call.
 */
export async function installPersistentSessions(
  target: AppRuntimeTarget,
): Promise<PersistentSessionsApi | null> {
  return createPersistentSessionsApi({
    appId: target.manifest.id,
    packagePath: target.manifest.packagePath,
    workspaceId: target.workspace.id,
    // The proposal's workspace, not the runtime instance's: a profile-global
    // runtime (the Architect) runs under the synthetic `global` workspace and
    // proposes sessions for a real project workspace.
    approveGrant: (proposal, link) => clampAndApprove(proposal.workspaceId, proposal, link),
    resolveModel: async (modelId): Promise<CreateAgentSessionOptions['model']> => {
      const { modelRuntime } = await ensureAiInfra();
      const model = (await modelRuntime.getAvailable())
        .find((candidate) => modelKey(candidate.provider, candidate.id) === modelId);
      // Validation already checked availability; reaching here means the model
      // disappeared between the two, so failing is correct.
      if (!model) throw new Error(`Model ${modelId} is no longer available.`);
      return model;
    },
    buildSessionInputs: async (input) => {
      const infra = await ensureAiInfra();
      // Second filter, after the allowlist: a profile that restricts nothing is
      // decorative, and the approval dialog described the profile.
      const { allowed, removed } = applyPermissionProfile(input.tools, input.policy.permissionProfile);
      if (removed.length > 0) {
        console.warn(`[persistent-sessions] permission profile removed: ${removed.join(', ')}`);
      }
      // The CLI scope of this session. Pi names its own session only after the
      // session exists, and the CLI registry needs the name BEFORE that — so the
      // scope is the host-issued grant and subject, which are unique per member
      // and known here. Leaving it blank makes the registry fall back to
      // whichever chat is open in the workspace, which would show the member
      // another session's app commands and hide its own.
      const cliScopeId = `${input.grantId}:${input.subject}`;
      // This session's own command surface, starting empty. The app's own
      // commands are bridged into it below; the shared surface — app control,
      // workspaces, other plugins — never is. A member that could reach `sero
      // app click` could drive the user's desktop, which is not a capability
      // any Room approval describes, and a member with no Room command to run
      // WILL go looking for another way to talk.
      const cliRegistry = createPrivateCliRegistry();
      const memberRuntime = await runtimeManager.getRuntime(input.workspaceId);
      const memberContainerState = containerPromptState(memberRuntime);
      // The runtime tools run where the runtime runs. In a container that is not the host path.
      const hostWorkspacePath = workspaceManager.getPath(input.workspaceId);
      const toolCwd = memberRuntime.backend === 'host' || !hostWorkspacePath
        ? input.cwd
        : toRuntimeCwd(hostWorkspacePath, input.cwd);
      const runtimeTools = await createMemberRuntimeTools(input.workspaceId, allowed, toolCwd, cliScopeId);
      // The grant-owning app and the search plugin always load. Any other plugin
      // loads only because an approved tool comes from it, and only that tool
      // is kept from it.
      const basePackages = [target.manifest.packagePath, ...searchPluginPackages()];
      const approvedPackages = approvedToolPackages(allowed, basePackages);
      return {
        tools: allowed,
        modelRuntime: infra.modelRuntime,
        settingsManager: infra.settingsManager,
        // Without this the session has no `sero-cli` tool object at all, so the
        // approved `sero-cli` name matches nothing and the member cannot run a
        // single Room command (AD-020).
        customTools: [
          createWorkspaceCliTool(input.workspaceId, cliScopeId, cliRegistry),
          ...runtimeTools,
        ],
        resourceLoader: await createMemberResourceLoader({
          cwd: input.cwd,
          // The POLICY's skills, intersected with what the request asked for —
          // the request alone would be the caller's word for it.
          allowedSkills: input.skills.filter((skill) => input.policy.allowedSkills.includes(skill)),
          appendSystemPrompt: input.systemPromptAdditions,
          settingsManager: infra.settingsManager,
          // The app that holds the grant, plus the built-in search plugin. The
          // search tools are read-only and the permission profile still gates
          // them, so a member approved for `filesystem: 'read'` can find a file
          // instead of guessing its path; a member approved for none cannot.
          packages: [...basePackages, ...approvedPackages],
          extensionFactories: [
            createSeroExtensionFactory(workspaceManager, input.workspaceId, cliScopeId, memberContainerState, {
              // No agent-management tools: a Room member must not be able to
              // spawn agents outside the roster the user approved.
              enableAgentManagementTools: false,
              cliRegistry,
            }),
          ],
          bridgeExtensions: (base) => {
            // Apply this to every member. The grant-owning app is loaded beside
            // FFF and could otherwise replace an approved search name with a
            // different implementation, regardless of its permission profile.
            const restricted = restrictSearchToolOrigins(base);
            const forMember = dropToolsNotForSessionKind(keepApprovedTools(restricted, allowed, approvedPackages), 'member');
            const provided = new Set([
              'sero-cli',
              ...runtimeTools.map((tool) => tool.name),
              ...forMember.extensions.flatMap((extension) => [...extension.tools.keys()]),
            ]);
            const missing = allowed.filter((name) => !provided.has(name));
            if (missing.length > 0) {
              console.warn(`[persistent-sessions] ${input.subject} approved tools not provided: ${missing.join(', ')}`);
            }
            const bridged = bridgeExtensionTools(forMember, { sessionId: cliScopeId, registry: cliRegistry });
            // The one line that says whether the member can talk at all. A Room
            // whose members hold no `room` command looks like a Room that has
            // nothing to say, so the commands and any extension that failed to
            // load are both worth a line of log.
            const commands = cliRegistry.list({ sessionId: cliScopeId }).map((command) => command.name);
            console.log(
              `[persistent-sessions] ${input.subject} commands: ${commands.join(', ') || 'none'}`
              + ` (from ${bridged.extensions.map((extension) => extension.resolvedPath).join(', ') || 'no extensions'})`,
            );
            for (const failure of bridged.errors) {
              console.log(`[persistent-sessions] ${input.subject} extension failed: ${failure.path}: ${failure.error}`);
            }
            return bridged;
          },
        }),
      };
    },
    log: (message) => console.warn(`[persistent-sessions] ${message}`),
  });
}

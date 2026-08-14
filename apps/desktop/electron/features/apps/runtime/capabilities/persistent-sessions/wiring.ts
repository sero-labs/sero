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

import type { PersistentSessionGrantProposal, PersistentSessionsApi } from '@sero-ai/common';
import type { CreateAgentSessionOptions } from '@earendil-works/pi-coding-agent';

import { ensureAiInfra } from '@electron/shared/infra/ai-infra';
import { requestChoice } from '@electron/platform/desktop/request-choice';
import { bridgeExtensionTools } from '@electron/cli';
import { createSeroExtensionFactory } from '@electron/features/apps/extensions/create-sero-extension';
import { workspaceManager } from '@electron/features/workspace/manager';

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
async function clampAndApprove(
  proposal: PersistentSessionGrantProposal,
): Promise<{ approvalId: string; approved: PersistentSessionGrantProposal } | null> {
  const { modelRuntime } = await ensureAiInfra();
  const availableModels = new Set((await modelRuntime.getAvailable()).map((model) => model.id));

  const subjects = Object.fromEntries(
    Object.entries(proposal.subjects).map(([subject, policy]) => [
      subject,
      {
        ...policy,
        // Only models this machine can actually resolve. A grant naming an
        // absent model would fail at create time instead of at approval time,
        // which is the wrong moment to discover it.
        allowedModels: policy.allowedModels.filter((model) => availableModels.has(model)),
      },
    ]),
  );

  const clamped: PersistentSessionGrantProposal = { ...proposal, subjects };
  const memberCount = Object.keys(subjects).length;

  const choice = await requestChoice({
    title: 'Allow persistent agent sessions?',
    body: `${proposal.reason}\n\n${memberCount} agent${memberCount === 1 ? '' : 's'}, up to ${clamped.maxLiveSessions} running at once.`,
    choices: [
      { id: 'allow', label: 'Allow' },
      { id: 'deny', label: 'Not now' },
    ],
    timeoutMs: 120_000,
  });

  // A timeout is a denial. Silence must never widen authority.
  if (choice.choiceId !== 'allow') return null;

  return { approvalId: `approval_${Date.now().toString(36)}`, approved: clamped };
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
    approveGrant: clampAndApprove,
    resolveModel: async (modelId): Promise<CreateAgentSessionOptions['model']> => {
      const { modelRuntime } = await ensureAiInfra();
      const model = (await modelRuntime.getAvailable()).find((candidate) => candidate.id === modelId);
      // Validation already checked availability; reaching here means the model
      // disappeared between the two, so failing is correct.
      if (!model) throw new Error(`Model ${modelId} is no longer available.`);
      return model;
    },
    buildSessionInputs: async (input) => {
      const infra = await ensureAiInfra();
      return {
        modelRuntime: infra.modelRuntime,
        settingsManager: infra.settingsManager,
        resourceLoader: createMemberResourceLoader({
          cwd: input.cwd,
          // The POLICY's skills, intersected with what the request asked for —
          // the request alone would be the caller's word for it.
          allowedSkills: input.skills.filter((skill) => input.policy.allowedSkills.includes(skill)),
          appendSystemPrompt: input.systemPromptAdditions,
          settingsManager: infra.settingsManager,
          extensionFactories: [
            createSeroExtensionFactory(workspaceManager, target.workspace.id, '', undefined, {
              // No agent-management tools: a Room member must not be able to
              // spawn agents outside the roster the user approved.
              enableAgentManagementTools: false,
            }),
          ],
          bridgeExtensions: (base) => bridgeExtensionTools(base),
        }),
      };
    },
    log: (message) => console.warn(`[persistent-sessions] ${message}`),
  });
}

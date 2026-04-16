import type { SubagentManager } from '../subagent';
import { ROLE_AGENT_NAMES } from './agents';
import type { CollaborationRole } from '@/types/collaboration';

export type CollaborationDiscoveryRunner = Pick<SubagentManager, 'listAgents'>;

export const REQUIRED_COLLABORATION_ROLES: CollaborationRole[] = [
  'researcher',
  'analyst',
  'visionary',
  'coordinator',
];

interface ValidateRequiredAgentsOptions {
  strategyLabel: string;
  requiredRoles?: CollaborationRole[];
}

interface MissingRequiredAgent {
  role: CollaborationRole;
  agentName: string;
}

function getMissingRequiredAgents(
  availableAgentNames: Set<string>,
  requiredRoles: CollaborationRole[],
): MissingRequiredAgent[] {
  return requiredRoles
    .map((role) => ({
      role,
      agentName: ROLE_AGENT_NAMES[role],
    }))
    .filter((requiredAgent) => !availableAgentNames.has(requiredAgent.agentName));
}

function formatMissingRequiredAgents(missingAgents: MissingRequiredAgent[]): string {
  return missingAgents.map((agent) => `${agent.role} (${agent.agentName})`).join(', ');
}

/**
 * Ensure required collaboration agents are present before orchestration starts.
 */
export async function validateRequiredCollaborationAgents(
  manager: CollaborationDiscoveryRunner,
  options: ValidateRequiredAgentsOptions,
): Promise<void> {
  const requiredRoles = options.requiredRoles ?? REQUIRED_COLLABORATION_ROLES;

  const discoveredAgents = await manager.listAgents();
  const availableAgentNames = new Set(discoveredAgents.map((agent) => agent.name));
  const missingAgents = getMissingRequiredAgents(availableAgentNames, requiredRoles);

  if (missingAgents.length === 0) {
    return;
  }

  throw new Error(
    `${options.strategyLabel} preflight failed: missing required agents: ${formatMissingRequiredAgents(missingAgents)}.`,
  );
}

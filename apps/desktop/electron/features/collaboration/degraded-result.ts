import type { CollaborationResult, CollaborationRole } from '@/types/collaboration';
import { budgetPromptText } from './prompt-budget';

const OUTPUT_SNIPPET_MAX_CHARS = 800;

type SpecialistOutput = CollaborationResult['specialistOutputs'][number];

interface MissingRoleDetail {
  role: CollaborationRole;
  agentName: string;
  reason: string;
}

export function hasUsableSpecialistOutput(output: SpecialistOutput | undefined): boolean {
  if (!output) {
    return false;
  }

  if (output.error) {
    return false;
  }

  return output.response.trim().length > 0;
}

function getFailureReason(output: SpecialistOutput | undefined): string {
  if (!output) {
    return 'did not run';
  }

  if (output.error) {
    return output.error;
  }

  return 'returned an empty response';
}

export function getMissingRequiredRoles(
  specialistOutputs: CollaborationResult['specialistOutputs'],
  requiredRoles: CollaborationRole[],
): MissingRoleDetail[] {
  return requiredRoles
    .map((role) => {
      const output = specialistOutputs.find((candidate) => candidate.role === role);
      if (hasUsableSpecialistOutput(output)) {
        return null;
      }

      return {
        role,
        agentName: output?.agentName ?? role,
        reason: getFailureReason(output),
      };
    })
    .filter((detail): detail is MissingRoleDetail => detail !== null);
}

export function buildDegradedFinalResponse(
  strategyLabel: string,
  missingRoles: MissingRoleDetail[],
  specialistOutputs: CollaborationResult['specialistOutputs'],
): string {
  const missingRoleLines = missingRoles
    .map((detail) => `- ${detail.role} (${detail.agentName}): ${detail.reason}`)
    .join('\n');

  const availableOutputLines = specialistOutputs
    .filter((output) => hasUsableSpecialistOutput(output))
    .map(
      (output) =>
        `### ${output.role}\n${budgetPromptText(output.response, OUTPUT_SNIPPET_MAX_CHARS)}`,
    )
    .join('\n\n');

  return `${strategyLabel} ran in degraded mode and skipped coordinator synthesis because one or more required specialist outputs were missing.

## Missing required specialist outputs
${missingRoleLines || '- none'}

${availableOutputLines ? `## Available specialist output snippets\n${availableOutputLines}` : ''}`;
}

/**
 * Agent role definitions for the 4-agent collaboration framework.
 *
 * Agents are defined as proper .md template files in packages/templates/agents/
 * and discovered by the SubagentManager at runtime. This module maps roles to
 * agent names and provides the Coordinator's synthesis prompt builder.
 */

import type { CollaborationRole } from '@/types/collaboration';
export type { CollaborationRole } from '@/types/collaboration';

/**
 * Map of collaboration role → discovered agent name (from .md frontmatter).
 *
 * These names must match the "name" field in the corresponding template:
 * - packages/templates/agents/researcher.md
 * - packages/templates/agents/collab-analyst.md  (avoids clash with kanban analyst)
 * - packages/templates/agents/visionary.md
 * - packages/templates/agents/coordinator.md
 */
export const ROLE_AGENT_NAMES: Record<CollaborationRole, string> = {
  coordinator: 'coordinator',
  researcher: 'researcher',
  analyst: 'collab-analyst',
  visionary: 'visionary',
};

/** Phase 2 specialists that run in parallel after the researcher. */
export const PARALLEL_SPECIALIST_ROLES: CollaborationRole[] = ['analyst', 'visionary'];


/** Build the Coordinator's synthesis prompt with the specialists' outputs. */
export function buildCoordinatorSynthesisPrompt(
  originalQuery: string,
  researcherOutput: string,
  analystOutput: string,
  visionaryOutput: string,
): string {
  return `Three specialist agents have independently analyzed the following user query. Synthesize their outputs into a single, coherent, high-quality response.

## Original User Query
${originalQuery}

## Specialist Outputs

### The Researcher (Fact-Checking)
${researcherOutput}

### The Analyst (Logic / Math / Code)
${analystOutput}

### The Visionary (Creative / Divergent)
${visionaryOutput}

Produce ONE cohesive response. Do NOT mention the specialists or internal process.`;
}

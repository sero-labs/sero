import type { Card } from '@sero/common';

export function buildPlanningPrompt(card: Card): string {
  let prompt = `# Task: ${card.title}\n\n`;

  if (card.description) {
    prompt += `## Description\n${card.description}\n\n`;
  }

  if (card.acceptance.length > 0) {
    prompt += '## Acceptance Criteria\n';
    for (const criterion of card.acceptance) {
      prompt += `- ${criterion}\n`;
    }
    prompt += '\n';
  }

  prompt += `Priority: ${card.priority}\n`;
  return prompt;
}

export interface PlanGenerationOptions {
  testingEnabled?: boolean;
}

export function buildSubtaskGenerationPrompt(
  card: Card,
  planningContext: string,
  options?: PlanGenerationOptions,
): string {
  const testingEnabled = options?.testingEnabled !== false;
  const tddBlock = testingEnabled
    ? `- Designate each subtask's testing approach:
  - "tdd": Write tests first, then implement (for core logic, utilities, data transformations)
  - "test-after": Implement first, then write tests (for integration, UI wiring)
  - "no-test": No tests needed (for config, scaffolding, documentation)
- Include a dedicated test-writing subtask when the feature has testable logic`
    : '- Set tddDesignation to "no-test" for all subtasks (testing is disabled for this workspace)';

  return `Create a detailed implementation plan with subtasks for this card.

# Card: ${card.title}
${card.description ? `\nDescription: ${card.description}` : ''}
${card.acceptance.length > 0 ? `\nAcceptance Criteria:\n${card.acceptance.map((item) => `- ${item}`).join('\n')}` : ''}

# Planning Context
${planningContext}

# Instructions
Generate a structured implementation plan. When it is ready, call the \`kanban_submit_plan\` tool once with this exact shape:

\`\`\`
{
  "plan": "A 2-4 paragraph description of the implementation approach",
  "subtasks": [
    {
      "id": "1",
      "title": "Short title for this subtask",
      "description": "What this subtask involves",
      "dependsOn": [],
      "tddDesignation": "tdd | test-after | no-test",
      "filePaths": ["src/path/to/file.ts"],
      "complexity": "low | medium | high"
    }
  ]
}
\`\`\`

The tool submission is the authoritative result.
Do not return the final plan as raw JSON in normal text after calling the tool.
If this is an existing project, do your own codebase inspection before finalising the plan instead of assuming the context block is exhaustive.

Rules for subtasks:
- 2-8 subtasks is ideal, each scoped to 15-30 minutes of agent work
- Each subtask should be independently implementable where possible
- Use dependsOn to specify ordering constraints (array of subtask IDs)
- Parallelisable subtasks should have empty dependsOn arrays
- List exact file paths each subtask creates or modifies (for parallel conflict detection)
- Estimate complexity: low (~15min), medium (~30min), high (~45min+)
${tddBlock}
- Keep descriptions concise but specific`;
}

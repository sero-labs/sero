/**
 * Bootstrap — first-run setup for the memory system.
 *
 * On first run, provides questionnaire definitions for the agent to ask the
 * user in two steps (identity, then the user profile). The agent uses the
 * `questionnaire` tool to collect answers, then writes IDENTITY.md and USER.md
 * with `sero memory write`. Onboarding never writes long-term memories.
 */

import type { QuestionnairePayload } from '../shared/types';

import { hasConvertedLegacyMemory } from './conversion';
import {
  resolveMemoryRoot,
  getIdentityPath,
  getMemoryPath,
  getUserPath,
  fileExists,
  readFile,
} from './memory-manager';

// ── Questionnaire definitions ──────────────────────────────────
//
// Typed objects — serialised to JSON when injected into the system
// prompt. Compile-time validated via QuestionnairePayload.
//
// The predefined options are intentional: they should drive the
// questionnaire's click-to-select multiple-choice UI whenever possible,
// while `allowOther` keeps a free-text escape hatch for custom answers.

export const IDENTITY_QUESTIONS: QuestionnairePayload = {
  questions: [
    {
      id: 'agent_name',
      label: 'AI Name',
      prompt: 'What should the AI assistant call itself?',
      options: [
        { value: 'Sero', label: 'Sero', description: 'Default Sero identity' },
        { value: 'Assistant', label: 'Assistant', description: 'Neutral, generic assistant name' },
        { value: 'Claude', label: 'Claude', description: 'Keep the Claude name' },
      ],
      allowOther: true,
    },
    {
      id: 'personality',
      label: 'Personality',
      prompt: 'Which personality traits should the AI emphasise?',
      options: [
        { value: 'direct', label: 'Direct & concise', description: 'Straight to the point, minimal filler' },
        { value: 'friendly', label: 'Friendly & conversational', description: 'Warm, natural, collaborative tone' },
        { value: 'professional', label: 'Professional & formal', description: 'Structured, precise, business-like' },
        { value: 'casual', label: 'Casual & relaxed', description: 'Laid-back, informal, natural' },
      ],
      allowOther: true,
      multiSelect: true,
    },
    {
      id: 'rules',
      label: 'Rules',
      prompt: 'Any specific behavioural rules for the AI?',
      options: [
        { value: 'none', label: 'No special rules', description: 'Use the default behaviour', exclusive: true },
        { value: 'british', label: 'Use British English spellings', description: 'Prefer colour, organise, etc.' },
        { value: 'no-emoji', label: 'Avoid emoji', description: 'Keep responses text-only' },
        { value: 'concise', label: 'Keep responses short', description: 'Bias toward compact answers' },
      ],
      allowOther: true,
      multiSelect: true,
    },
  ],
};

export const USER_QUESTIONS: QuestionnairePayload = {
  questions: [
    {
      id: 'name',
      label: 'Name',
      prompt: "What's your name (how should the AI address you)?",
      options: [],
      allowOther: true,
    },
    {
      id: 'role',
      label: 'Role',
      prompt: 'Which roles best describe you?',
      options: [
        { value: 'software-engineer', label: 'Software Engineer', description: 'Builds software / writes code' },
        { value: 'designer', label: 'Designer', description: 'Product, UX, or visual design' },
        { value: 'product-manager', label: 'Product Manager', description: 'Roadmaps, requirements, coordination' },
        { value: 'founder', label: 'Founder / Entrepreneur', description: 'Runs or is building a company/product' },
        { value: 'student', label: 'Student', description: 'Learning, studying, or early-career' },
      ],
      allowOther: true,
      multiSelect: true,
    },
    {
      id: 'location',
      label: 'Location',
      prompt: 'What timezone or region are you in? (for time/context cues)',
      options: [
        { value: 'us-pacific', label: 'US / Pacific', description: 'West Coast North America' },
        { value: 'us-eastern', label: 'US / Eastern', description: 'East Coast North America' },
        { value: 'uk-ireland', label: 'UK / Ireland', description: 'GMT / BST' },
        { value: 'central-europe', label: 'Central Europe', description: 'CET / CEST' },
        { value: 'india', label: 'India', description: 'IST' },
        { value: 'east-asia', label: 'East Asia', description: 'China, Singapore, nearby' },
        { value: 'australia-eastern', label: 'Australia / Eastern', description: 'AEST / AEDT' },
      ],
      allowOther: true,
    },
    {
      id: 'stack',
      label: 'Tech Stack',
      prompt: 'Which tech stacks do you work in most?',
      options: [
        { value: 'ts-react', label: 'TypeScript + React', description: 'Frontend or full-stack TS work' },
        { value: 'python', label: 'Python', description: 'Scripting, data, backend, or AI workflows' },
        { value: 'rust', label: 'Rust', description: 'Systems or performance-focused work' },
        { value: 'go', label: 'Go', description: 'Backend, infra, or tooling' },
        { value: 'fullstack-js', label: 'Full-stack JavaScript', description: 'Node + browser JavaScript' },
      ],
      allowOther: true,
      multiSelect: true,
    },
    {
      id: 'communication',
      label: 'Comms Style',
      prompt: 'How should the AI communicate with you?',
      options: [
        { value: 'direct', label: 'Direct — no waffle, just answers', description: 'Optimise for speed and clarity' },
        { value: 'explanatory', label: 'Explanatory — teach me as we go', description: 'Include reasoning and learning context' },
        { value: 'collaborative', label: 'Collaborative — discuss options together', description: 'Explore trade-offs before deciding' },
        {
          value: 'caveman',
          label: 'Caveman mode — compressed replies',
          description: 'Cut filler and tokens while keeping technical accuracy',
          subQuestion: {
            id: 'caveman_level',
            label: 'Caveman Level',
            prompt: 'How strong should caveman mode be?',
            options: [
              { value: 'lite', label: 'Lite', description: 'Keep grammar. Remove filler and pleasantries.' },
              { value: 'full', label: 'Full', description: 'Drop articles and filler. Fragments are fine.' },
              { value: 'ultra', label: 'Ultra', description: 'Maximum compression with symbols and fragments.' },
            ],
            allowOther: false,
          },
        },
      ],
      allowOther: true,
      multiSelect: true,
    },
    {
      id: 'coding_style',
      label: 'Coding Style',
      prompt: 'Any coding style the AI should follow?',
      options: [
        { value: 'none', label: 'No strong preference', description: 'Use whatever best fits the task', exclusive: true },
        { value: 'functional', label: 'Prefer functional patterns over classes', description: 'Lean toward functions and composition' },
        { value: 'oop', label: 'Prefer OOP / class-based', description: 'Class-oriented structure is welcome' },
        { value: 'strong-types', label: 'Prefer strong typing / explicit types', description: 'Bias toward explicit type safety' },
        { value: 'tests-first', label: 'Prefer tests or verification for changes', description: 'Validate behaviour when practical' },
      ],
      allowOther: true,
      multiSelect: true,
    },
  ],
};

// ── Bootstrap logic ────────────────────────────────────────────

export interface BootstrapStatus {
  needsBootstrap: boolean;
  existingUserContent: string | null;
}

/**
 * Onboarding is needed only for a profile with no identity and no memory from
 * the old plugin (a `MEMORY.md`, or the backup the conversion left).
 */
export async function checkBootstrapStatus(): Promise<BootstrapStatus> {
  const root = resolveMemoryRoot();
  const onboarded = await fileExists(getIdentityPath(root))
    || await fileExists(getMemoryPath(root))
    || await hasConvertedLegacyMemory();
  if (onboarded) return { needsBootstrap: false, existingUserContent: null };

  // USER.md often exists already in older setups.
  const userContent = (await readFile(getUserPath(root)))?.trim();
  return { needsBootstrap: true, existingUserContent: userContent || null };
}

function formatToolParamsJson(value: unknown): string {
  return `\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``;
}

/** System prompt addition that walks the agent through onboarding. */
export function buildBootstrapInstructions(existingUserContent: string | null): string {
  const userNote = existingUserContent
    ? `\n\nNote: USER.md already has content:\n\`\`\`\n${existingUserContent}\n\`\`\`\nConfirm this is correct with the user rather than re-asking. Skip the user questionnaire if the content looks good.`
    : '';

  return `
## Memory Setup Required

The memory system is not yet initialised. You MUST set it up now before doing anything else.
Use the \`questionnaire\` tool to ask the user two rounds of questions, then write the answers to the profile files.${userNote}

The questionnaire UI supports step-based multiple-choice forms, multi-select questions, and option-specific \`subQuestion\` choices. For any question that already includes predefined \`options\`, preserve those options exactly so the user gets clickable choices. Do NOT rewrite option-based questions into free-form chat. Only rely on custom text when none of the provided options fit.

### Step 1: Identity Setup
YOU MUST call the \`questionnaire\` tool with the exact JSON parameters below to configure the agent persona. Preserve every \`options\`, \`label\`, \`description\`, \`exclusive\`, \`multiSelect\`, and \`allowOther\` field exactly as shown:
${formatToolParamsJson(IDENTITY_QUESTIONS)}

After receiving answers, write IDENTITY.md:
\`sero memory write --target identity --content "# Identity\\n\\n- **Name:** <agent_name answer>\\n- **Style:** <personality answers joined with commas if multiple>\\n- **Rules:** <rules answers joined with commas if multiple>"\`

### Step 2: User Profile Setup
YOU MUST call the \`questionnaire\` tool again with the exact JSON parameters below to configure the user profile. Keep the predefined options intact so the user can tap through the multiple-choice UI where applicable:
${formatToolParamsJson(USER_QUESTIONS)}

After receiving answers, write USER.md:
\`sero memory write --target user --content "# User\\n\\n- **Name:** <name>\\n- **Role:** <role answers joined with commas if multiple>\\n- **Location:** <location>\\n- **Tech Stack:** <stack answers joined with commas if multiple>\\n- **Communication:** <communication answers joined with commas if multiple>\\n- **Caveman Mode:** <lite|full|ultra if selected, otherwise off>\\n- **Coding Style:** <coding_style answers joined with commas if multiple>"\`

If the user selected caveman mode but the level answer is unavailable, write \`full\` for \`Caveman Mode\`.

### Important
- Run each questionnaire step in order — don't skip steps.
- Use the exact tool parameters shown above.
- Prefer the predefined multiple-choice options whenever they fit; \`allowOther\` is only the fallback for custom answers.
- For any \`multiSelect\` question, preserve all selected human-readable answers when writing the profile files.
- When writing the profile files, use the human-readable answer text the user selected or typed.
- Do not save long-term memories during setup.
- After writing both files, confirm to the user that memory is set up.
- Be friendly and natural between steps — this is a first-time experience.`;
}

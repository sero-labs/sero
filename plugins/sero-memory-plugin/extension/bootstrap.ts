/**
 * Bootstrap — first-run setup for the memory system.
 *
 * On first run (no MEMORY.md), creates empty template files and
 * provides questionnaire definitions for the agent to ask the user.
 * The agent uses the `questionnaire` tool to collect answers, then
 * writes results to memory files via `sero memory write`.
 */

import type { QuestionnairePayload } from '../shared/types';

import {
  resolveMemoryRoot,
  ensureDirectories,
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
  ],
};

export const MEMORY_QUESTIONS: QuestionnairePayload = {
  questions: [
    {
      id: 'tech_knowledge',
      label: 'Technical',
      prompt: 'Any crucial technical knowledge to remember? (frameworks, patterns, configs)',
      options: [
        { value: 'none', label: 'Nothing specific right now', description: 'No key technical context to save yet', exclusive: true },
        { value: 'repo-docs-source', label: 'The repo/docs are the source of truth', description: 'Read existing code and docs before guessing' },
        { value: 'env-constraints', label: 'There are important environment/setup constraints', description: 'Config, platform, or setup details matter' },
      ],
      allowOther: true,
      multiSelect: true,
    },
    {
      id: 'explorer_prefs',
      label: 'Explorer',
      prompt: 'Any explorer preferences or conventions to remember?',
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
    {
      id: 'projects',
      label: 'Projects',
      prompt: 'Any active projects or contexts the AI should know about?',
      options: [
        { value: 'none', label: 'Nothing specific right now', description: 'No active project context to store yet' },
        { value: 'one-main-project', label: 'One main active project', description: 'There is a primary project to optimise around' },
        { value: 'multiple-contexts', label: 'Multiple active projects / contexts', description: 'Expect task-switching across different areas' },
      ],
      allowOther: true,
    },
  ],
};

// ── Bootstrap logic ────────────────────────────────────────────

export interface BootstrapStatus {
  needsBootstrap: boolean;
  existingUserContent: string | null;
}

/**
 * Check whether the memory system needs bootstrapping.
 * Creates directories if needed. Does NOT create any template files —
 * those are written by the agent after collecting questionnaire answers.
 */
export async function checkBootstrapStatus(): Promise<BootstrapStatus> {
  const root = resolveMemoryRoot();
  await ensureDirectories(root);

  const memoryPath = getMemoryPath(root);
  const memoryExists = await fileExists(memoryPath);

  if (memoryExists) {
    return { needsBootstrap: false, existingUserContent: null };
  }

  // Check if USER.md already has content (common in existing setups)
  const userPath = getUserPath(root);
  const userContent = await readFile(userPath);
  const hasUserContent = !!userContent?.trim();

  return {
    needsBootstrap: true,
    existingUserContent: hasUserContent ? userContent!.trim() : null,
  };
}

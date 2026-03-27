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

export const IDENTITY_QUESTIONS: QuestionnairePayload = {
  questions: [
    {
      id: 'agent_name',
      label: 'AI Name',
      prompt: 'What should the AI assistant call itself?',
      options: [
        { value: 'Sero', label: 'Sero' },
        { value: 'Assistant', label: 'Assistant' },
        { value: 'Claude', label: 'Claude' },
      ],
      allowOther: true,
    },
    {
      id: 'personality',
      label: 'Personality',
      prompt: 'What personality style should the AI have?',
      options: [
        { value: 'direct', label: 'Direct & concise', description: 'Straight to the point, minimal filler' },
        { value: 'friendly', label: 'Friendly & conversational', description: 'Warm, natural, collaborative tone' },
        { value: 'professional', label: 'Professional & formal', description: 'Structured, precise, business-like' },
        { value: 'casual', label: 'Casual & relaxed', description: 'Laid-back, informal, natural' },
      ],
      allowOther: true,
    },
    {
      id: 'rules',
      label: 'Rules',
      prompt: 'Any specific behavioural rules for the AI?',
      options: [
        { value: 'none', label: 'No special rules' },
        { value: 'british', label: 'Use British English spellings' },
        { value: 'no-emoji', label: 'Avoid emoji' },
        { value: 'concise', label: 'Keep responses short' },
      ],
      allowOther: true,
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
      prompt: "What's your role or profession?",
      options: [
        { value: 'software-engineer', label: 'Software Engineer' },
        { value: 'designer', label: 'Designer' },
        { value: 'product-manager', label: 'Product Manager' },
        { value: 'student', label: 'Student' },
      ],
      allowOther: true,
    },
    {
      id: 'location',
      label: 'Location',
      prompt: 'Where are you based? (for timezone context)',
      options: [],
      allowOther: true,
    },
    {
      id: 'stack',
      label: 'Tech Stack',
      prompt: "What's your primary tech stack?",
      options: [
        { value: 'ts-react', label: 'TypeScript + React' },
        { value: 'python', label: 'Python' },
        { value: 'rust', label: 'Rust' },
        { value: 'go', label: 'Go' },
        { value: 'fullstack-js', label: 'Full-stack JavaScript' },
      ],
      allowOther: true,
    },
    {
      id: 'communication',
      label: 'Comms Style',
      prompt: 'How do you prefer the AI to communicate?',
      options: [
        { value: 'direct', label: 'Direct — no waffle, just answers' },
        { value: 'explanatory', label: 'Explanatory — teach me as we go' },
        { value: 'collaborative', label: 'Collaborative — discuss options together' },
      ],
      allowOther: true,
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
        { value: 'none', label: 'Nothing specific right now' },
      ],
      allowOther: true,
    },
    {
      id: 'coding_prefs',
      label: 'Coding',
      prompt: 'Any coding preferences or conventions?',
      options: [
        { value: 'functional', label: 'Prefer functional patterns over classes' },
        { value: 'oop', label: 'Prefer OOP / class-based' },
        { value: 'none', label: 'No strong preference' },
      ],
      allowOther: true,
    },
    {
      id: 'projects',
      label: 'Projects',
      prompt: 'Any active projects or contexts the AI should know about?',
      options: [
        { value: 'none', label: 'Nothing specific right now' },
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

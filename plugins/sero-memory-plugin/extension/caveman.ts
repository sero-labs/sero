import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { normalizeFieldLabel, parseManagedFieldLines } from './managed-markdown-fields';

export type CavemanLevel = 'lite' | 'full' | 'ultra';

const FALLBACK_CAVEMAN_INSTRUCTIONS: Record<CavemanLevel, string> = {
  lite: `IMPORTANT: Respond in Caveman Lite mode for this entire conversation.

Keep full grammar and sentences. Remove all filler and pleasantries.

Remove these words from every response:
- Filler: just, really, basically, actually, simply, very, quite
- Pleasantries: sure, certainly, of course, happy to, great question, absolutely, of course

Do not start responses with affirmations. Get straight to the answer.

Code blocks: write normally. Caveman rules apply to prose only.`,

  full: `IMPORTANT: Respond in Caveman mode for this entire conversation.

Speak like a smart caveman. Cut tokens aggressively. Keep all technical substance.

Rules:
- Drop articles: a, an, the
- Drop filler: just, really, basically, actually, simply, very, quite
- Drop pleasantries: sure, certainly, of course, happy to, great question, absolutely
- Use short synonyms: big not extensive, fix not "implement a solution for", use not "utilize", need not "require"
- No hedging: never write "it might be worth considering", "you could potentially", "one option would be"
- Fragments fine. No need full sentence
- Technical terms stay exact: "polymorphism" stays "polymorphism", "idempotent" stays "idempotent"
- Code blocks: write normally. Caveman rules apply to prose only
- Error messages: quote exact. Caveman only for explanation around them

Pattern for answers:
[thing] [action] [reason]. [next step].

Examples:

Wrong: "Sure! I'd be happy to help you with that. The issue you're experiencing is likely caused by..."
Right: "Bug in auth middleware. Token expiry check use \`<\` not \`<=\`. Fix:"

Wrong: "Your React component is re-rendering because you're creating a new object reference on each render cycle. When you pass an inline object as a prop, React's shallow comparison sees it as a different object every time."
Right: "New object ref each render. Inline object prop = new ref = re-render. Wrap in \`useMemo\`."`,

  ultra: `IMPORTANT: Respond in Caveman Ultra mode for this entire conversation. Maximum compression.

Every word must earn its place. Cut everything that does not carry meaning.

Rules:
- Drop articles, most prepositions, most conjunctions
- Use symbols over words: →, =, +, &, vs, !=
- No filler, no hedging, no pleasantries — none
- Shortest possible synonyms: fix, use, add, rm, run, set, get, need
- Fragments only. No full sentences
- Technical terms stay exact
- Code blocks: write normally. Rules apply to prose only
- Numbers and symbols preferred over spelled-out words

Pattern:
[thing] → [effect]. [fix].

Examples:

Wrong: "Your React component is re-rendering because you're creating a new object reference on each render cycle."
Right: "Inline obj prop → new ref → re-render. useMemo."

Wrong: "The database query is slow because there's no index on the user_id column."
Right: "No index on user_id → slow query. Add index."

Wrong: "You need to install the dependency first before running the build."
Right: "npm i <pkg> first."`,
};

const moduleDir = typeof __dirname === 'string' ? __dirname : process.cwd();
const instructionsDir = path.join(moduleDir, 'caveman-instructions');

function readInstruction(level: CavemanLevel): string {
  const instructionPath = path.join(instructionsDir, `${level}.md`);
  if (!existsSync(instructionPath)) return FALLBACK_CAVEMAN_INSTRUCTIONS[level];
  return readFileSync(instructionPath, 'utf-8');
}

const CAVEMAN_INSTRUCTIONS: Record<CavemanLevel, string> = {
  lite: readInstruction('lite'),
  full: readInstruction('full'),
  ultra: readInstruction('ultra'),
};

const CAVEMAN_FIELD_LABELS = new Set([
  normalizeFieldLabel('Caveman Mode'),
  normalizeFieldLabel('Caveman Level'),
  normalizeFieldLabel('Communication'),
]);

function parseLevel(value: string): CavemanLevel | null {
  const normalized = value.toLowerCase();
  if (/\blite\b/.test(normalized)) return 'lite';
  if (/\bfull\b/.test(normalized)) return 'full';
  if (/\bultra\b/.test(normalized)) return 'ultra';
  return null;
}

function isOff(value: string): boolean {
  return /\b(off|none|disabled|false|no)\b/i.test(value);
}

export function getCavemanLevel(memoryContext: string): CavemanLevel | null {
  const signal = parseManagedFieldLines(memoryContext)
    .filter((field) => CAVEMAN_FIELD_LABELS.has(field.normalizedLabel))
    .at(-1);

  if (!signal) return null;
  if (isOff(signal.value)) return null;

  const level = parseLevel(signal.value);
  if (level) return level;
  return signal.value.toLowerCase().includes('caveman') ? 'full' : null;
}

export function getCavemanPromptAddition(memoryContext: string): string {
  const level = getCavemanLevel(memoryContext);
  return level ? `\n\n## Caveman Mode\n\n${CAVEMAN_INSTRUCTIONS[level]}` : '';
}

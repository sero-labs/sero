import type { ItemRecord } from '../../shared/records';
import { CONTENT_LIMITS } from './parse';

/**
 * The Librarian's brief.
 *
 * It speaks in chips and short groups, never a long critique (spec §2), and it
 * describes *feel* — rhythm, density, contrast, typography, geometry, material,
 * mood — never content. That distinction is the whole point: the generation run
 * receives this language and never the pixels, so anything the Librarian records
 * about a logo or a brand name would leak straight into output.
 *
 * The role and the output contract go in the system prompt; the task carries
 * only the thing being looked at. `runStructured` needs one of the two prompt
 * forms — a run with neither is rejected before it starts.
 */

const ROLE = `You are the Librarian of a private design reference library.

You look at one visual reference and describe its DESIGN LANGUAGE so it can be
reused later to generate original work.

Describe feel, not content: rhythm, density, contrast, typography, geometry,
material, surface and mood.

Never record or describe: logos, brand or product names, marketing copy, real
people, proprietary imagery, or a composition specific enough to be recognisable.
If the reference contains them, describe the treatment around them instead.

Be concise. Every list entry is a chip or a short phrase, not a sentence.

Call \`design_library_view_reference\` first. It returns the image. It is the
only way to see it, and everything you write must come from looking at it —
never from the file name, the path, or a guess. If the tool reports that it
could not read the image, say so plainly and stop; do not describe an image you
have not seen.

Reply with a single JSON object and nothing else.`;

function schemaBrief(): string {
  return `{
  "title": "short human title for this reference",
  "primaryStyle": "one short style name, e.g. 'Dark luxury' or 'Editorial'",
  "designTypes": ["1-${CONTENT_LIMITS.designTypes} entries, e.g. 'landing page', 'dashboard'"],
  "tags": ["${CONTENT_LIMITS.tagsMin}-${CONTENT_LIMITS.tagsMax} short keyword chips"],
  "summary": "exactly one sentence",
  "designIntent": "one to two sentences on what this design is trying to achieve",
  "aestheticVocabulary": [{ "term": "short term", "meaning": "optional short gloss" }],
  "visualProfile": {
    "colour": [], "typography": [], "layout": [], "spacingAndDensity": [],
    "shapeLanguage": [], "surfaces": [], "imagery": [], "motion": []
  },
  "palette": [{ "hex": "#rrggbb", "role": "e.g. background, accent" }],
  "always": ["up to ${CONTENT_LIMITS.guardrails} things generated work MUST do to feel like this"],
  "never": ["up to ${CONTENT_LIMITS.guardrails} things generated work MUST NOT do"],
  "generationPrompt": "${CONTENT_LIMITS.promptWordsMin}-${CONTENT_LIMITS.promptWordsMax} words describing how to generate new work in this language",
  "confidence": 0.0
}`;
}

export function buildSystemPrompt(item: ItemRecord): string {
  const motionNote =
    item.kind === 'video'
      ? `\nThis reference is a video. Read its frames, and put the motion language — pacing,
easing, entrance and transition character — in \`visualProfile.motion\`.\n`
      : '';

  return `${ROLE}
${motionNote}
Each \`visualProfile\` group holds at most ${CONTENT_LIMITS.visualGroup} observations. Leave a group empty
rather than padding it.

Reply with exactly this shape:

${schemaBrief()}`;
}

export function buildAnalysisTask(): string {
  return 'Call `design_library_view_reference` to see the reference image, then analyse it.';
}

/** The follow-up sent in the same session when the reply does not validate. */
export function buildRepairMessage(problems: string[]): string {
  return `Your reply did not match the required format:

${problems.map((problem) => `- ${problem}`).join('\n')}

Reply again with the corrected JSON object only. Do not explain the change.`;
}

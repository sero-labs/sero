/**
 * Librarian prompt and structured-output contract.
 *
 * Multimodal input works through Pi's own `read` tool: the run is given the
 * read tool only, and reading an image file attaches it to the request with
 * bounded resizing. No new host seam and no bespoke image transport.
 */

export const LIBRARIAN_PROMPT_VERSION = 1;
export const LIBRARIAN_SCHEMA_VERSION = 1;

export const LIBRARIAN_SYSTEM_PROMPT = `You are the Sero Design Librarian.

You analyse a single reference image and describe its DESIGN LANGUAGE — the
qualities another designer would need in order to create original work with the
same feel.

Describe rhythm, density, contrast, typography, geometry, material treatment,
colour behaviour and mood. Never describe or transcribe the specific content:
no brand names, logos, product names, headlines, copy or recognisable
composition. If a brand is visible, describe only its stylistic treatment.

Reply with a single JSON object and nothing else. No prose, no code fence.`;

export function buildLibrarianTask(fileName: string): string {
  return `Read the image file \`${fileName}\` in the current directory, then analyse it.

Reply with exactly this JSON shape:

{
  "title": "short descriptive name, no brand names",
  "primaryStyle": "one short style label",
  "designTypes": ["at most 3"],
  "tags": ["6 to 12 lowercase keywords"],
  "summary": "one sentence",
  "designIntent": "one or two sentences",
  "aestheticVocabulary": [{ "term": "word", "meaning": "short gloss" }],
  "visualProfile": {
    "colour": ["up to 4 observations"],
    "typography": ["up to 4"],
    "layout": ["up to 4"],
    "spacingAndDensity": ["up to 4"],
    "shapeLanguage": ["up to 4"],
    "surfaces": ["up to 4"],
    "imagery": ["up to 4"],
    "motion": ["up to 4"]
  },
  "palette": [{ "hex": "#rrggbb", "role": "background | surface | accent | text" }],
  "always": ["up to 5 rules a new design should follow"],
  "never": ["up to 5 rules a new design must avoid"],
  "generationPrompt": "80 to 150 words describing how to build something new in this language",
  "confidence": 0.0
}`;
}

const REQUIRED_KEYS = [
  'title',
  'primaryStyle',
  'designTypes',
  'tags',
  'summary',
  'designIntent',
  'aestheticVocabulary',
  'visualProfile',
  'always',
  'never',
  'generationPrompt',
];

/** Extract the JSON object from a reply that may still carry a code fence. */
export function extractJson(reply: string): unknown {
  const trimmed = reply.trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(trimmed);
  const candidate = fenced ? fenced[1] : trimmed;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}

/** Repair instruction returned to the same session when the reply is unusable. */
export function validateLibrarianReply(reply: string): string | null {
  const parsed = extractJson(reply);
  if (!parsed || typeof parsed !== 'object') {
    return 'That reply was not a JSON object. Reply with only the JSON object described earlier.';
  }
  const record = parsed as Record<string, unknown>;
  const missing = REQUIRED_KEYS.filter((key) => record[key] === undefined);
  if (missing.length > 0) {
    return `The JSON object is missing: ${missing.join(', ')}. Reply again with the complete object.`;
  }
  if (!Array.isArray(record.tags) || record.tags.length < 3) {
    return 'Provide at least three tags. Reply again with the complete JSON object.';
  }
  return null;
}

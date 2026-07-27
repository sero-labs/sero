/**
 * Design generation prompt and output contract.
 *
 * References are supplied as analysis, never as pixels: the run has no access
 * to the source images at all, which is what guarantees reference pixels can
 * never reach generated output.
 */

import type { EditableLibrarianProfile, OutputTarget } from '../../shared/types';
import { resolveLibrarianField } from '../../shared/schemas';

export const GENERATION_PROMPT_VERSION = 1;

export const APPROVED_DEPENDENCIES = ['react', 'react-dom', 'lucide-react'] as const;

export const GENERATION_SYSTEM_PROMPT = `You are the Sero Design generator.

You create ORIGINAL runnable interfaces in the design language described by the
supplied references. You inherit rhythm, density, contrast, typography,
geometry, material treatment and mood. You never reproduce logos, brand names,
copy, proprietary imagery, distinctive illustrations or a recognisable
composition from a reference.

Hard constraints:
- The output must run with no network access at all. No remote fonts, no CDN
  scripts, no external images, no analytics.
- Use only system font stacks: ui-sans-serif/system-ui, ui-serif/Georgia and
  ui-monospace/Menlo families.
- Illustrative artwork must come from the design_library_generate_asset tool.
  Interface icons must be inline SVG. Never invent an image path.
- Every visual quantity a person might reasonably want to adjust must be a CSS
  custom property declared in :root, so the Tweaks panel can bind to it.

Reply with a single JSON object and nothing else. No prose, no code fence.`;

function referenceBlock(profile: EditableLibrarianProfile, position: number): string {
  const field = <K extends Parameters<typeof resolveLibrarianField>[1]>(key: K) =>
    resolveLibrarianField(profile, key);
  const visual = field('visualProfile');
  const role = position === 0 ? 'PRIMARY — this reference leads the visual direction' : 'secondary';

  return `## Reference ${position + 1} (${role})
Style: ${field('primaryStyle')}
Summary: ${field('summary')}
Intent: ${field('designIntent')}
Tags: ${field('tags').join(', ')}
Vocabulary: ${field('aestheticVocabulary').map((entry) => entry.term).join(', ')}
Colour: ${visual.colour.join('; ')}
Typography: ${visual.typography.join('; ')}
Layout: ${visual.layout.join('; ')}
Spacing and density: ${visual.spacingAndDensity.join('; ')}
Shape language: ${visual.shapeLanguage.join('; ')}
Surfaces: ${visual.surfaces.join('; ')}
Imagery: ${visual.imagery.join('; ')}
Motion: ${visual.motion.join('; ')}
Always: ${field('always').join('; ')}
Never: ${field('never').join('; ')}
Direction: ${field('generationPrompt')}`;
}

export interface GenerationTaskInput {
  request: string;
  outputTarget: OutputTarget;
  references: EditableLibrarianProfile[];
  variantIndex: number;
  variantCount: number;
  /** Set when revising an existing revision rather than generating a new one. */
  revision?: { instruction: string; files: Array<{ path: string; contents: string }> };
}

function fileContract(target: OutputTarget): string {
  if (target === 'react-tailwind') {
    return `"files" must contain exactly these paths:
  - "App.tsx": a default-exported React component written in TypeScript, using
    Tailwind utility classes. Allowed imports: ${APPROVED_DEPENDENCIES.join(', ')}. No other package.
  - "styles.css": plain CSS holding the :root custom properties and any styles
    Tailwind utilities cannot express. Do not write @import or @tailwind here.`;
  }
  return `"files" must contain exactly these paths:
  - "body.html": the page markup that belongs inside <body>. No <html>, <head> or <body> tags.
  - "styles.css": all CSS, starting with a :root block of custom properties.
  - "app.js": optional page script. Use "" when the design needs no script.`;
}

export function buildGenerationTask(input: GenerationTaskInput): string {
  const references = input.references
    .map((profile, index) => referenceBlock(profile, index))
    .join('\n\n');

  const variantBrief = input.revision
    ? `You are revising an existing design. Apply this instruction faithfully and change nothing else:

${input.revision.instruction}

Current files:
${input.revision.files.map((file) => `--- ${file.path} ---\n${file.contents}`).join('\n\n')}`
    : `You are producing variant ${input.variantIndex + 1} of ${input.variantCount}. Decide for yourself how
different this variant should be from its siblings, based on what the request
needs — do not follow a fixed variation formula.`;

  return `# Request

${input.request}

${variantBrief}

# References

${references}

# Output

${fileContract(input.outputTarget)}

Reply with exactly this JSON shape:

{
  "title": "short name for this variant",
  "files": [{ "path": "...", "contents": "..." }],
  "tweaks": {
    "controls": [
      {
        "id": "kebab-case-id",
        "group": "a group name you choose for this design",
        "label": "human label",
        "cssVariable": "--a-property-you-declared-in-:root",
        "control": { "type": "range", "min": 0, "max": 10, "step": 0.5, "unit": "rem" },
        "defaultValue": 2
      }
    ]
  }
}

Tweak rules:
- Choose only controls that are genuinely useful for THIS design. Do not emit a
  standard set of controls, and do not pad the list.
- Every control must name a CSS custom property you actually declared in
  :root, and changing it must visibly change the page.
- Control types are "range" (min, max, step, optional unit), "toggle"
  (offValue, onValue), "colour" (values are #rrggbb) and "choice" (options of
  { label, value }).
- defaultValue must equal the value you declared in :root.
- Font controls may only offer the approved system stacks.`;
}

const REQUIRED_PATHS: Record<OutputTarget, string[]> = {
  html: ['body.html', 'styles.css'],
  'react-tailwind': ['App.tsx', 'styles.css'],
};

export function validateGenerationReply(target: OutputTarget) {
  return function validate(reply: string): string | null {
    const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(reply.trim());
    const candidate = fenced ? fenced[1] : reply.trim();
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start === -1 || end <= start) {
      return 'That reply was not a JSON object. Reply with only the JSON object described earlier.';
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(candidate.slice(start, end + 1));
    } catch {
      return 'That JSON could not be parsed. Reply again with a single valid JSON object.';
    }
    const record = parsed as Record<string, unknown>;
    if (!Array.isArray(record.files)) {
      return 'The JSON object needs a "files" array. Reply again with the complete object.';
    }
    const paths = record.files
      .map((file) => (file as { path?: unknown }).path)
      .filter((value): value is string => typeof value === 'string');
    const missing = REQUIRED_PATHS[target].filter((required) => !paths.includes(required));
    if (missing.length > 0) {
      return `The files array is missing: ${missing.join(', ')}. Reply again with every required file.`;
    }
    return null;
  };
}

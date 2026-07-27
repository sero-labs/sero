import type {
  AppliedGuardrails,
  DesignBrief,
  DesignVariant,
  InspirationStrength,
} from '../../shared/design';
import type { LibrarianUserFacingAnalysis } from '../../shared/librarian';
import type { PromptRecipe } from '../../shared/settings';
import { TARGET_CONTRACTS } from '../../shared/targets';

/**
 * The generation brief (spec §6.1–§6.3).
 *
 * The run is given the Librarian's structured language and never the reference
 * pixels. That is not an optimisation — a reference may contain a logo, a brand
 * name or a recognisable composition, and the Librarian's analysis is the layer
 * that already excluded them. Handing over the image would put all of it back.
 *
 * The run also has no platform tools. Everything it produces arrives through
 * `design_library_write_file`, so there is no workspace, no filesystem and no
 * network anywhere in the path.
 */

export interface ReferenceLanguage {
  itemId: string;
  /** 0 is primary and leads the visual direction. */
  order: number;
  analysis: LibrarianUserFacingAnalysis;
}

const STRENGTH_NOTES: Record<InspirationStrength, string> = {
  light:
    'Take the references as a loose starting point. The request leads; borrow mood and a little rhythm, and let the rest be your own.',
  balanced:
    'Hold the request and the reference language in balance. The result should be recognisably in this language while clearly answering the request.',
  strong:
    'Adhere closely to the reference language. Rhythm, density, type treatment and surface should read as the same family of work.',
};

function section(title: string, entries: string[]): string {
  const kept = entries.filter((entry) => entry.trim() !== '');
  return kept.length === 0 ? '' : `${title}: ${kept.join('; ')}`;
}

/** One reference, as language. Nothing here identifies the original image. */
function describeReference(reference: ReferenceLanguage): string {
  const { analysis } = reference;
  const profile = analysis.visualProfile;
  const lines = [
    `## Reference ${reference.order + 1}${reference.order === 0 ? ' (primary — leads the visual direction)' : ''}`,
    section('Style', [analysis.primaryStyle]),
    section('Intent', [analysis.designIntent]),
    section('Vocabulary', analysis.aestheticVocabulary.map((term) => term.term)),
    section('Colour', profile.colour),
    section('Palette', (analysis.palette ?? []).map((entry) => `${entry.hex} (${entry.role})`)),
    section('Typography', profile.typography),
    section('Layout', profile.layout),
    section('Spacing and density', profile.spacingAndDensity),
    section('Shape language', profile.shapeLanguage),
    section('Surfaces', profile.surfaces),
    section('Imagery', profile.imagery),
    section('Motion', profile.motion),
    analysis.generationPrompt.trim() === ''
      ? ''
      : `How to work in this language: ${analysis.generationPrompt}`,
  ];
  return lines.filter((line) => line !== '').join('\n');
}

function guardrailBlock(guardrails: AppliedGuardrails): string {
  const lines: string[] = [];
  if (guardrails.always.length > 0) {
    lines.push('MUST do:', ...guardrails.always.map((rule) => `- ${rule}`));
  }
  if (guardrails.never.length > 0) {
    lines.push('MUST NOT do:', ...guardrails.never.map((rule) => `- ${rule}`));
  }
  return lines.length === 0 ? '' : `## Guardrails\n\nThese are not suggestions.\n\n${lines.join('\n')}`;
}

function targetRules(brief: DesignBrief): string {
  const contract = TARGET_CONTRACTS[brief.target];
  const shared = [
    `Write ${contract.label}.`,
    `Start with \`${contract.entry}\`. Allowed file types: ${contract.extensions.join(', ')}.`,
    'The preview has no network. No remote fonts, images, scripts, stylesheets or analytics — none of them will load.',
    'Fonts are limited to the system sans and mono stacks. Use `font-family: system-ui, sans-serif` or `ui-monospace, monospace`.',
    'Imagery is CSS — gradients, shapes, masks — or inline SVG you write yourself.',
    'Use realistic content lengths. Placeholder text that is all the same width makes a layout look untested.',
    'The page must be responsive and must not scroll horizontally at any width.',
  ];

  const perTarget =
    brief.target === 'html'
      ? [
          'Everything the page needs must be in the files you write. Put styles in `styles.css` and behaviour in `script.js`, or inline them — both work.',
          'No imports, no modules, no build step. Plain browser JavaScript.',
        ]
      : [
          'Export the page as the default export of `App.tsx`. Do not call `createRoot` yourself — the preview mounts it.',
          `You may import only: ${contract.approvedImports.map((entry) => `\`${entry}\``).join(', ')}. Relative imports between the files you write are fine.`,
          'Tailwind utility classes are available. There is no Tailwind config file, so stay on the default scale and use arbitrary values (`w-[42ch]`) where you need to leave it.',
        ];

  return `## Output\n\n${[...shared, ...perTarget].map((rule) => `- ${rule}`).join('\n')}`;
}

export function buildGenerationSystemPrompt(): string {
  return `You are a senior product designer who builds the thing rather than describing it.

You are given a request and the design language of one or more references, as
structured observations. You never see the reference images — the language is
what you work from, and it is deliberately free of logos, brand names and
recognisable compositions. Do not invent any.

Produce original work. Match the language; do not reproduce a reference layout.

Write each file with \`design_library_write_file\`. It is the only way to produce
anything — a reply with no file written is a failed run. When every file is
written, call \`design_library_name_design\` once with a two or three word name
for what you made and one sentence on the direction you took. Then stop; the
reply itself is not shown anywhere.`;
}

export interface GenerationTaskInput {
  brief: DesignBrief;
  guardrails: AppliedGuardrails;
  references: ReferenceLanguage[];
  variant: DesignVariant;
  /** Total variants in this Design, so the run knows how to differ from siblings. */
  variantCount: number;
  recipe?: PromptRecipe;
}

export function buildGenerationTask(input: GenerationTaskInput): string {
  const { brief, variant, variantCount } = input;

  // In per-reference mode a variant draws on its own reference only; in blend
  // mode every variant draws on all of them (spec §6.2).
  const references =
    variant.referenceItemId === undefined
      ? input.references
      : input.references.filter((reference) => reference.itemId === variant.referenceItemId);

  const diversity =
    variantCount === 1
      ? ''
      : `You are producing variant ${variant.index + 1} of ${variantCount}. Each variant is generated independently and they are compared side by side, so commit to one distinct interpretation rather than hedging between several. Choose the axis to vary — composition, density, hierarchy, colour weight, whichever the request makes most interesting — and take it further than feels safe.`;

  const blocks = [
    `# Request\n\n${brief.request}`,
    input.recipe === undefined ? '' : `# Approach\n\n${input.recipe.instruction}`,
    `# Reference language\n\n${STRENGTH_NOTES[brief.inspirationStrength]}\n\n${references
      .map(describeReference)
      .join('\n\n')}`,
    guardrailBlock(input.guardrails),
    targetRules(brief),
    diversity === '' ? '' : `## This variant\n\n${diversity}`,
  ];

  return blocks.filter((block) => block !== '').join('\n\n');
}

/** The follow-up sent in the same session when a run produced nothing usable. */
export function buildGenerationRepair(problem: string): string {
  return `${problem}

Write anything still missing with \`design_library_write_file\`, then name the design with \`design_library_name_design\`.`;
}

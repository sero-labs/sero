import type {
  AppliedGuardrails,
  DesignBrief,
  DesignVariant,
  InspirationStrength,
} from '../../shared/design';
import type { LibrarianUserFacingAnalysis } from '../../shared/librarian';
import type { DesignAsset } from '../../shared/media';
import { assetIsReady } from '../../shared/media';
import type { PromptRecipe } from '../../shared/settings';
import type { EmittedFile } from '../../shared/targets';
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

/**
 * The tweaks contract (spec §6.5).
 *
 * Written as a design instruction rather than a schema note because that is what
 * it is: the page has to be *built* to be adjustable — its decisions routed
 * through custom properties — before any control over it can be honest. A model
 * told only to declare controls at the end will declare them over a page whose
 * values are all hard-coded, and every one of them will be dropped.
 */
/**
 * What the run may do about imagery (spec §6.6).
 *
 * Stated in both directions on purpose. When the tools are absent the run is
 * told so and told what to do instead, because a model that assumes it can
 * generate a hero image writes markup pointing at one that never arrives — and
 * the page ships with a placeholder where its focal point should be.
 */
function mediaRules(available: boolean, existing: DesignAsset[] = []): string {
  // Artwork the Design already has, whoever asked for it — an earlier variant,
  // an explicit press, or this very run before it was interrupted.
  //
  // Load-bearing on a resumed run. A generation that restarts is a fresh
  // conversation: the model has no memory of the tool calls it already made, so
  // without being told, it asks for the same hero image again and pays for it
  // again. The durable cap bounds how much that can cost; this is what stops it
  // happening at all. It is also just true the rest of the time — assets belong
  // to the Design, and reusing one is free where generating another is not.
  const reusable = existing.filter(
    (asset) => asset.deletedAt === undefined && assetIsReady(asset),
  );
  const reuse =
    reusable.length === 0
      ? []
      : [
          '',
          'This Design already has artwork. Use these before generating anything new — they cost nothing and they are already what this Design looks like:',
          ...reusable.map(
            (asset) => `- \`${asset.reference}\` — ${asset.request.prompt || 'no description'}`,
          ),
        ];

  if (!available) {
    return [
      '## Imagery',
      '',
      reusable.length === 0
        ? 'You cannot generate imagery in this run. Build any illustrative artwork out of CSS — gradients, shapes, layered blends — or inline SVG you write yourself. Do not reference an image file: nothing will resolve it.'
        : 'You cannot generate new imagery in this run. Use the artwork this Design already has, listed below, and build anything else out of CSS or inline SVG you write yourself. Do not reference any other image file: nothing will resolve it.',
      ...reuse,
    ].join('\n');
  }
  return [
    '## Imagery',
    '',
    'You can generate illustrative artwork — a hero image, a texture, an abstract graphic — with the media tools. Each returns a reference like `assets/<id>.png`; use it as the `src` or in `url()` and it resolves in the preview and in the export.',
    '',
    'Generate sparingly and only where artwork is the point. Routine interface icons come from inline SVG you write yourself, never from the media tools. If a tool refuses — a limit reached, a video declined — carry on and finish the page without it rather than asking again.',
    ...reuse,
  ].join('\n');
}

function tweakRules(): string {
  const rules = [
    'Route the decisions worth revisiting through CSS custom properties: declare them once at the top (`:root { --display-scale: 34px; }`) and read them everywhere else with `var(--display-scale)`.',
    'Then call `design_library_declare_tweaks` once, declaring a control for each of those properties.',
    'Choose them from what this page is actually about. A dense metrics dashboard wants density and accent controls; an editorial page wants measure and type scale. Between four and ten is usually right.',
    'Every control must bind to a property the page declares **and** reads. One that does not is dropped, and a control that visibly does nothing is worse than a missing one.',
    'Do not emit a standard set. There is no catalogue to fill in — the controls are part of the design you made.',
    'Ranges carry a unit and sensible bounds either side of the value you shipped. Choices carry two or more real alternatives, not a scale in disguise.',
  ];
  return `## Live controls\n\n${rules.map((rule) => `- ${rule}`).join('\n')}`;
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
for what you made and one sentence on the direction you took, then
\`design_library_declare_tweaks\` once with the live controls for the page. Then
stop; the reply itself is not shown anywhere.`;
}

export interface GenerationTaskInput {
  brief: DesignBrief;
  guardrails: AppliedGuardrails;
  references: ReferenceLanguage[];
  variant: DesignVariant;
  /** Total variants in this Design, so the run knows how to differ from siblings. */
  variantCount: number;
  /** Whether the media tools are on this run's tool surface (spec §6.6). */
  mediaAvailable?: boolean;
  /**
   * Artwork this Design already has. Listed in the prompt so a run reuses it
   * rather than generating it again — which a *resumed* run would otherwise do
   * every time, having no memory of the tool calls it already paid for.
   */
  existingAssets?: DesignAsset[];
  recipe?: PromptRecipe;
  /** Present when this run is a revise rather than a first attempt. */
  revision?: { instruction: string; files: EmittedFile[] };
}

/**
 * The revise block (spec §6.4).
 *
 * The page is given in full. A model asked to change the header of a page it
 * cannot see rewrites the whole thing from the brief, and the parts nobody
 * mentioned come back subtly different — which is exactly the work a revise is
 * supposed to leave alone.
 */
function revisionBlock(revision: { instruction: string; files: EmittedFile[] }): string {
  const files = revision.files
    .map((file) => `### ${file.name}\n\n\`\`\`\n${file.content}\n\`\`\``)
    .join('\n\n');

  return `# Revise this design

Change what is asked and nothing else. This is an edit to a page that already
exists, not a fresh attempt at the brief: keep every decision the instruction
does not touch, including the parts you would do differently today.

Write the complete new contents of each file you change with
\`design_library_write_file\`. A file you do not write is kept as it is. Then name
and declare the controls again, as for any other run — the name and manifest
describe the page as it now stands.

## What to change

${revision.instruction}

## The design as it stands

${files}`;
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

  // A revise leads with the change and keeps the original brief underneath as
  // context: the instruction is what this run is for, and the brief is what the
  // page must still answer once it has been carried out.
  const blocks = [
    input.revision === undefined ? '' : revisionBlock(input.revision),
    `# Request\n\n${brief.request}`,
    input.recipe === undefined ? '' : `# Approach\n\n${input.recipe.instruction}`,
    `# Reference language\n\n${STRENGTH_NOTES[brief.inspirationStrength]}\n\n${references
      .map(describeReference)
      .join('\n\n')}`,
    guardrailBlock(input.guardrails),
    targetRules(brief),
    tweakRules(),
    mediaRules(input.mediaAvailable === true, input.existingAssets ?? []),
    // Only for a first attempt: a revise has siblings it already differs from,
    // and telling it to diverge again would undo the design it is editing.
    diversity === '' || input.revision !== undefined ? '' : `## This variant\n\n${diversity}`,
  ];

  return blocks.filter((block) => block !== '').join('\n\n');
}

/** The follow-up sent in the same session when a run produced nothing usable. */
export function buildGenerationRepair(problem: string): string {
  return `${problem}

Write anything still missing with \`design_library_write_file\`, then name the design with \`design_library_name_design\`.`;
}

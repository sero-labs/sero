import type {
  AppliedGuardrails,
  DesignBrief,
  DesignVariant,
  InspirationStrength,
} from '../../shared/design';
import { baselineTweakInstructions } from '../../shared/baseline-tweaks';
import { DESIGN_FONT_OPTIONS } from '../../shared/fonts';
import type { LibrarianUserFacingAnalysis } from '../../shared/librarian';
import type { DesignAsset } from '../../shared/media';
import { assetIsReady } from '../../shared/media';
import type { PromptRecipe } from '../../shared/settings';
import type { EmittedFile } from '../../shared/targets';
import { TARGET_CONTRACTS } from '../../shared/targets';

/**
 * The generation brief (spec §6.1–§6.3).
 *
 * Imported references reach the run only as the Librarian's structured
 * language. Artwork made by Design Library is the explicit exception: the run
 * may place the Design-owned copy by its `assets/...` reference.
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

/** One reference as language. Imported pixels are never identified here. */
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

function targetRules(brief: DesignBrief, mediaAvailable: boolean): string {
  const contract = TARGET_CONTRACTS[brief.target];
  const shared = [
    `Write ${contract.label}.`,
    `Start with \`${contract.entry}\`. Allowed file types: ${contract.extensions.join(', ')}.`,
    'The preview has no network. No remote fonts, images, scripts, stylesheets or analytics — none of them will load.',
    'Fonts are limited to the system sans and mono stacks. Use `font-family: system-ui, sans-serif` or `ui-monospace, monospace`.',
    // Conditional, and it has to be: as a flat rule this sat above the Imagery
    // section contradicting it, and a run given both read this one and never
    // touched the media tools at all — a brief that asked in as many words for
    // a hero image and two illustrations came back with four gradients.
    mediaAvailable
      ? 'Photographic and illustrative artwork comes from the media tools, described under Imagery below. Everything else — interface icons, dividers, decorative shapes — is CSS or inline SVG you write yourself.'
      : 'Imagery is CSS — gradients, shapes, masks — or inline SVG you write yourself.',
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
/** Enough of the tray to choose from, without it becoming the brief. */
const MAX_LISTED_ASSETS = 12;
const MAX_DESCRIPTION_CHARS = 160;

/** One line, always — a caption for a reference, not a section of the prompt. */
function describeArtwork(prompt: string): string {
  const flat = prompt.replace(/\s+/g, ' ').trim();
  if (flat === '') return 'no description';
  return flat.length <= MAX_DESCRIPTION_CHARS ? flat : `${flat.slice(0, MAX_DESCRIPTION_CHARS)}…`;
}

function mediaRules(
  available: boolean,
  existing: DesignAsset[] = [],
  callsRemaining?: number,
): string {
  // Artwork the Design already has, whoever asked for it — an earlier variant,
  // an explicit press, or this very run before it was interrupted.
  //
  // Load-bearing on a resumed run. A generation that restarts is a fresh
  // conversation: the model has no memory of the tool calls it already made, so
  // without being told, it asks for the same hero image again and pays for it
  // again. The durable cap bounds how much that can cost; this is what stops it
  // happening at all. It is also just true the rest of the time — assets belong
  // to the Design, and reusing one is free where generating another is not.
  const ready = existing.filter((asset) => asset.deletedAt === undefined && assetIsReady(asset));
  // Newest first and bounded. A tray grows without limit, and every description
  // in it is text a model wrote — left whole, a long tray crowds out the brief
  // it is meant to support, and a description running to several lines reads as
  // structure rather than as a caption.
  const reusable = ready.toSorted((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_LISTED_ASSETS);
  const omitted = ready.length - reusable.length;
  const reuse =
    reusable.length === 0
      ? []
      : [
          '',
          'This Design already has artwork. Use these before generating anything new — they cost nothing and they are already what this Design looks like:',
          ...reusable.map((asset) =>
            asset.sourceItemId === undefined
              ? `- \`${asset.reference}\` — ${describeArtwork(asset.request.prompt)}`
              : `- \`${asset.reference}\` — selected reference artwork made by Design Library: ${describeArtwork(asset.request.prompt)}`,
          ),
          ...(omitted === 0
            ? []
            : [`(and ${omitted} older ${omitted === 1 ? 'one' : 'ones'}, listed by the media tools.)`]),
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
  // Stated as a budget rather than as "sparingly". A vague instruction to
  // restrain itself is the one a model resolves by generating nothing at all,
  // and nothing at all is what a brief asking for a hero image got.
  const allowance =
    callsRemaining === undefined
      ? 'Generate what the design genuinely needs and no more.'
      : callsRemaining <= 0
        ? 'You have no generations left in this run. Use the artwork this Design already has and build the rest out of CSS or inline SVG.'
        : `You may generate up to ${callsRemaining} ${callsRemaining === 1 ? 'image or clip' : 'images or clips'} in this run. Spend them on what the design genuinely needs — a brief that asks for photography, illustration or a hero image is asking for these tools.`;

  return [
    '## Imagery',
    '',
    'You can generate illustrative artwork — a hero image, a texture, a photographic background, an abstract graphic — with the media tools. Each returns a reference like `assets/<id>.png`; use it as the `src` or in `url()` and it resolves in the preview and in the export.',
    '',
    allowance,
    '',
    'Routine interface icons come from inline SVG you write yourself, never from the media tools. If a tool refuses — a limit reached, a video declined — carry on and finish the page without it rather than asking again.',
    ...reuse,
  ].join('\n');
}

/** Keep direct reference artwork on the same boundary as reference language. */
function artworkForReferences(assets: DesignAsset[], references: ReferenceLanguage[]): DesignAsset[] {
  const selected = new Set(references.map((reference) => reference.itemId));
  return assets.filter(
    (asset) => asset.sourceItemId === undefined || selected.has(asset.sourceItemId),
  );
}

function tweakRules(): string {
  const rules = [
    'Every page must route its typography through the seven standard custom properties below. Declare each property once at `:root`, read it with `var()` on the element it names, and declare its control first in the exact order shown.',
    'Font applies to `h1` and `h2`. H1 size, weight and tracking apply to `h1`. H2 size applies to `h2`. Body font and body size apply to `body` and inherited body copy.',
    `Font and Body font are standard font pickers. Declare each as a choice with the page’s current stack as its exact default: ${DESIGN_FONT_OPTIONS.map((option) => `\`${option.value}\``).join(', ')}. Omit their options because the runtime supplies the complete catalog. H1 weight choices must include the weight the page ships with. Size ranges carry a sensible CSS unit; H1 tracking uses \`em\`.`,
    'Connect the baseline to its intended text with CSS rules that target `h1`, `h2` and `body`: `h1` owns Font, H1 size, H1 weight and H1 tracking; `h2` owns H2 size; `body` owns Body font and Body size. Qualified selectors such as `.hero h1` are valid. The page must contain an `h1` and an `h2`.',
    'Make Body size a real page-wide type scale. Define a few derived properties such as `--text-xs: calc(var(--body-size) * .75)`, `--text-sm`, `--text-base` and `--text-lg`. Use those properties or inherited Body size for body copy, controls, tables, labels and utility text. Do not hard-code `font-size` or `font` shorthand sizes in `px`, `rem`, `em` or `pt`; H1 and H2 keep their independent baseline properties.',
    `Required baseline controls:\n${baselineTweakInstructions()}`,
    'After the baseline, add only the page-specific decisions worth revisiting. A dense metrics dashboard may want density and accent controls; an editorial page may want measure. Two to six page-specific controls is usually right.',
    'Call `design_library_declare_tweaks` once, with the baseline followed by those page-specific controls.',
    'Every control must bind to a property the page declares **and** reads. One that does not is dropped, and a control that visibly does nothing is worse than a missing one.',
    'Ranges carry a unit and sensible bounds either side of the value you shipped. Page-specific choices carry two or more real alternatives, not a scale in disguise.',
  ];
  return `## Live controls\n\n${rules.map((rule) => `- ${rule}`).join('\n')}`;
}

export function buildGenerationSystemPrompt(): string {
  return `You are a senior product designer who builds the thing rather than describing it.

You are given a request and the design language of one or more references, as
structured observations. Imported references are language only, deliberately
free of logos, brand names and recognisable compositions. Artwork made by
Design Library may also be listed as a local \`assets/...\` path; that is source
artwork you may place directly, not an invitation to reconstruct its pixels.

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
  /** Media calls this run may still make, so the allowance is a number not a mood. */
  mediaCallsRemaining?: number;
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
    targetRules(brief, input.mediaAvailable === true),
    tweakRules(),
    mediaRules(
      input.mediaAvailable === true,
      artworkForReferences(input.existingAssets ?? [], references),
      input.mediaCallsRemaining,
    ),
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

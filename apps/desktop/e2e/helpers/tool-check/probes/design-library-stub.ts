/**
 * The stub model's answers to the two background model runs the Design
 * Library makes: the Librarian that reads a reference image, and the
 * generation run that writes a Design.
 *
 * Both runs call the model through the host, outside the probe's own chat
 * session. The responder tells them apart by the custom tool each was given
 * (the run needs a model that calls it), the same facts the plugin's own
 * tests build their stub from (`runtime/coordinator-harness.ts`).
 *
 * `ctx.state.librarian` picks how the Librarian answers:
 * `ok` (default), `hold` (never finishes, so a cancel has something to
 * cancel) or `bad` (not JSON, so the analysis fails). A generation run whose
 * request contains `HOLD-PROBE` does not finish until `ctx.state.released`.
 */
import type { StubReply, StubRequest } from '../../stub-model';
import type { StepContext } from '../types';

const VIEW_TOOL = 'design_library_view_reference';
const WRITE_TOOL = 'design_library_write_file';

/**
 * A reply `runtime/librarian/parse.ts` accepts: `parseAnalysis` takes the JSON
 * object, `validateAnalysis` wants 1-3 design types, 6-12 tags and an
 * 80-150 word generation prompt. The guardrails are what a Design's
 * `synthesis` reports back.
 */
export function analysisReply(title: string): string {
  return JSON.stringify({
    title,
    primaryStyle: 'Technical monochrome',
    designTypes: ['dashboard'],
    tags: ['a', 'b', 'c', 'd', 'e', 'f'],
    summary: 'A summary.',
    designIntent: 'An intent.',
    aestheticVocabulary: [{ term: 'exact' }],
    visualProfile: { colour: ['near-black'] },
    palette: [{ hex: '#0b0b0d', role: 'background' }],
    always: ['Keep geometry square'],
    never: ['Decorative gradients'],
    generationPrompt: Array.from({ length: 100 }, () => 'word').join(' '),
    confidence: 0.9,
  });
}

/**
 * A page `shared/baseline-tweaks.ts` accepts: h1, h2 and body each read their
 * typography custom property, and no text size is hard-coded.
 */
const BASELINE_STYLE = '<style>:root{--font-family:system-ui,sans-serif;--h1-size:48px;--h1-weight:650;--h1-tracking:-0.04em;--h2-size:28px;--body-font:system-ui,sans-serif;--body-size:16px}h1,h2{font-family:var(--font-family)}h1{font-size:var(--h1-size);font-weight:var(--h1-weight);letter-spacing:var(--h1-tracking)}h2{font-size:var(--h2-size)}body{font-family:var(--body-font);font-size:var(--body-size)}</style>';

export const PAGE_MARKER = '<p id="generated">Generated page</p>';
export const PAGE = `<body>${BASELINE_STYLE}<h1>Generated page</h1><h2>Section</h2>${PAGE_MARKER}</body>`;
const REVISED_PAGE = PAGE.replace('<h1>Generated page</h1>', '<h1>Generated page, revised</h1>');

/** The Typography baseline `design_library_declare_tweaks` requires first, in its flat wire shape. */
const BASELINE_CONTROLS = [
  { id: 'font', group: 'Typography', label: 'Font', cssVariable: '--font-family', type: 'choice', defaultValue: 'system-ui, sans-serif' },
  { id: 'h1-size', group: 'Typography', label: 'H1 size', cssVariable: '--h1-size', type: 'range', defaultValue: '48', min: 24, max: 96, step: 1, unit: 'px' },
  {
    id: 'h1-weight', group: 'Typography', label: 'H1 weight', cssVariable: '--h1-weight', type: 'choice', defaultValue: '650',
    options: ['400', '650', '800'].map((value) => ({ label: value, value })),
  },
  { id: 'h1-tracking', group: 'Typography', label: 'H1 tracking', cssVariable: '--h1-tracking', type: 'range', defaultValue: '-0.04', min: -0.1, max: 0.1, step: 0.01, unit: 'em' },
  { id: 'h2-size', group: 'Typography', label: 'H2 size', cssVariable: '--h2-size', type: 'range', defaultValue: '28', min: 16, max: 64, step: 1, unit: 'px' },
  { id: 'body-font', group: 'Typography', label: 'Body font', cssVariable: '--body-font', type: 'choice', defaultValue: 'system-ui, sans-serif' },
  { id: 'body-size', group: 'Typography', label: 'Body size', cssVariable: '--body-size', type: 'range', defaultValue: '16', min: 12, max: 24, step: 1, unit: 'px' },
];

function toolCall(id: string, name: string, args: Record<string, unknown>): StubReply {
  return { toolCalls: [{ id, name, arguments: args }] };
}

function firstUserText(request: StubRequest): string {
  return request.messages.find((message) => message.role === 'user')?.text ?? '';
}

function librarianReply(ctx: StepContext, request: StubRequest, toolResults: number): StubReply {
  const mode = ctx.state.librarian ?? 'ok';
  if (mode === 'hold') return toolCall(`dl-hold-${toolResults}`, VIEW_TOOL, {});
  const earlier = request.messages.flatMap((message) => message.toolCalls).find((call) => call.id.startsWith('dl-view-'));
  if (toolResults === 0 || !earlier) {
    const run = Number(ctx.state.librarianRuns ?? 0) + 1;
    ctx.state.librarianRuns = run;
    return toolCall(`dl-view-${run}`, VIEW_TOOL, {});
  }
  // The run must view the image before its reply counts (runtime/librarian/run.ts).
  if (mode === 'bad') return { text: 'I could not read this reference.' };
  return { text: analysisReply(`Analysed ${earlier.id.slice('dl-view-'.length)}`) };
}

function generationReply(ctx: StepContext, request: StubRequest, toolResults: number): StubReply {
  const task = firstUserText(request);
  if (task.includes('HOLD-PROBE') && ctx.state.released !== true) {
    return toolCall(`dl-gen-hold-${toolResults}`, 'design_library_name_design', { name: `Hold ${toolResults}`, summary: 'Waiting.' });
  }
  // A revise starts from the page as it stands, and must change it
  // (runtime/generation/run.ts: a run that touches nothing is refused).
  const page = task.includes('# Revise this design') ? REVISED_PAGE : PAGE;
  switch (toolResults) {
    case 0:
      return toolCall('dl-gen-write', WRITE_TOOL, { name: 'index.html', content: page });
    case 1:
      return toolCall('dl-gen-name', 'design_library_name_design', { name: 'Signal ledger', summary: 'Typography-led panel.' });
    case 2:
      return toolCall('dl-gen-tweaks', 'design_library_declare_tweaks', { controls: BASELINE_CONTROLS });
    default:
      return { text: 'Done.' };
  }
}

function respond(ctx: StepContext, request: StubRequest): StubReply | undefined {
  const tools = request.tools.map((tool) => tool.name);
  const toolResults = request.messages.filter((message) => message.role === 'tool').length;
  if (tools.includes(VIEW_TOOL)) return librarianReply(ctx, request, toolResults);
  if (tools.includes(WRITE_TOOL)) return generationReply(ctx, request, toolResults);
  return undefined;
}

/** Answers the Library's model runs until `removeModelStub`. Safe to call twice. */
export function installModelStub(ctx: StepContext): void {
  if (ctx.state.removeModelStub) return;
  if (!ctx.respondWith) throw new Error('this step needs respondWith');
  ctx.state.librarian = 'ok';
  ctx.state.removeModelStub = ctx.respondWith((request) => respond(ctx, request));
}

export function removeModelStub(ctx: StepContext): void {
  const remove = ctx.state.removeModelStub;
  if (typeof remove === 'function') remove();
  delete ctx.state.removeModelStub;
}

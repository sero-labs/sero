/**
 * Loom extension — Pi tools the agent uses to author generative art by composing
 * a layered graph (with an expression DSL) in the plugin's file-backed state.
 *
 * Global-scoped: $SERO_HOME/apps/loom/state.json (Sero) or
 * .sero/apps/loom/state.json relative to cwd (Pi CLI fallback).
 *
 * Tools: loom_get, loom_compose, loom_direction, loom_random, loom_preset, loom_capture
 * Command: /loom-surprise
 */

import { StringEnum } from '@earendil-works/pi-ai';
import type { ExtensionAPI, ToolDefinition } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';

import {
  mergeGraphPatch,
  normalizeGraph,
  randomGraph,
  structuredCloneState,
  validateGraph,
  type LoomState,
} from '../shared/types';
import { readState, resolveStatePath, writeCapture, writeState } from './state-io';

type ToolText = { content: { type: 'text'; text: string }[]; details: Record<string, never> };
const text = (s: string): ToolText => ({ content: [{ type: 'text', text: s }], details: {} });

function summarize(state: LoomState): string {
  const layers = state.graph.layers
    .map((l) => `${l.enabled === false ? '(off) ' : ''}${l.type}`)
    .join(' + ');
  return `${state.graph.layers.length} layer(s): ${layers}`;
}

function issuesText(graph: ReturnType<typeof normalizeGraph>): string {
  const issues = validateGraph(graph);
  if (issues.length === 0) return '';
  const lines = issues.slice(0, 8).map((i) => `  • ${i.path}: "${i.expr}" — ${i.error}`);
  return `\n⚠ ${issues.length} expression issue(s) (those fields fall back until fixed):\n${lines.join('\n')}`;
}

function decodePng(dataUrl: string): Buffer | null {
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl.trim());
  return m ? Buffer.from(m[1], 'base64') : null;
}

let presetCounter = Date.now();
const makePresetId = () => `piece-${(presetCounter++).toString(36)}`;

// ── Schemas ─────────────────────────────────────────────────────

const GetParams = Type.Object({});
const ComposeParams = Type.Object({
  graph: Type.Optional(Type.Unknown()),
  patch: Type.Optional(Type.Unknown()),
});
const DirectionParams = Type.Object({
  action: StringEnum(['get', 'set'] as const),
  guidance: Type.Optional(Type.String({ description: 'Persistent creative direction (for set)' })),
});
const RandomParams = Type.Object({ seed: Type.Optional(Type.Number()) });
const PresetParams = Type.Object({
  action: StringEnum(['save', 'load', 'list', 'delete'] as const),
  name: Type.Optional(Type.String()),
  id: Type.Optional(Type.String()),
});
const CaptureParams = Type.Object({
  dataUrl: Type.String({ description: 'PNG data URL (data:image/png;base64,...)' }),
  width: Type.Number(),
  height: Type.Number(),
  name: Type.Optional(Type.String()),
  writeSidecar: Type.Optional(Type.Boolean()),
});

// ── Extension ───────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  let warmCwd = process.cwd();
  pi.on('session_start', async (_e, ctx) => {
    warmCwd = ctx.cwd;
  });
  const cwdFrom = (ctx?: { cwd: string }) => ctx?.cwd ?? warmCwd;

  const getTool: ToolDefinition<typeof GetParams> = {
    name: 'loom_get',
    label: 'Loom: get',
    description:
      'Read the current Loom graph and creative direction. Call this BEFORE composing so you can iterate on / combine with what is already there instead of overwriting blind.',
    parameters: GetParams,
    async execute(_id, _params, _signal, _onUpdate, ctx) {
      const state = await readState(resolveStatePath(cwdFrom(ctx)));
      const payload = { direction: state.direction.guidance, graph: state.graph };
      return text(JSON.stringify(payload, null, 2));
    },
  };

  const composeTool: ToolDefinition<typeof ComposeParams> = {
    name: 'loom_compose',
    label: 'Loom: compose',
    description:
      'Author the art. Pass a full `graph` (replace) OR a `patch` (shallow-merged; `layers` replaces the whole list). The graph is a layered document — combine raymarch + particle layers freely. Any numeric field may be a number OR {"expr":"..."} using the expression language (vars: t, p, id, depth, ny; fns: sin, cos, noise, mix, clamp, length, vec3, …). Invalid expressions are reported and fall back, so iterate.',
    parameters: ComposeParams,
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const statePath = resolveStatePath(cwdFrom(ctx));
      const state = await readState(statePath);
      if (params.graph === undefined && params.patch === undefined) {
        return text('Error: provide `graph` (full) or `patch` (partial).');
      }
      const next =
        params.graph !== undefined
          ? normalizeGraph(params.graph)
          : mergeGraphPatch(state.graph, params.patch);
      state.graph = next;
      await writeState(statePath, state);
      return text(`Composed → ${summarize(state)}${issuesText(next)}`);
    },
  };

  const directionTool: ToolDefinition<typeof DirectionParams> = {
    name: 'loom_direction',
    label: 'Loom: direction',
    description:
      "Read or set the user's persistent creative direction — taste/constraints honored on every generation (e.g. 'cinematic, slow, dark teal; organic forms; avoid harsh reds').",
    parameters: DirectionParams,
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const statePath = resolveStatePath(cwdFrom(ctx));
      const state = await readState(statePath);
      if (params.action === 'get') {
        return text(state.direction.guidance || '(no creative direction set)');
      }
      state.direction.guidance = params.guidance ?? '';
      await writeState(statePath, state);
      return text('Creative direction updated.');
    },
  };

  const randomTool: ToolDefinition<typeof RandomParams> = {
    name: 'loom_random',
    label: 'Loom: random',
    description: 'Generate and apply a fresh randomized graph (may combine layers). Optional seed for reproducibility.',
    parameters: RandomParams,
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const statePath = resolveStatePath(cwdFrom(ctx));
      const state = await readState(statePath);
      state.graph = randomGraph(params.seed);
      await writeState(statePath, state);
      return text(`New random piece → ${summarize(state)}`);
    },
  };

  const presetTool: ToolDefinition<typeof PresetParams> = {
    name: 'loom_preset',
    label: 'Loom: preset',
    description: 'Manage saved pieces. Actions: save (name), load (name|id), list, delete (name|id).',
    parameters: PresetParams,
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const statePath = resolveStatePath(cwdFrom(ctx));
      const state = await readState(statePath);
      switch (params.action) {
        case 'list':
          return text(state.presets.length ? state.presets.map((p) => `• ${p.name} (${p.id})`).join('\n') : 'No saved pieces yet.');
        case 'save': {
          if (!params.name) return text('Error: name is required.');
          const preset = { id: makePresetId(), name: params.name, createdAt: Date.now(), graph: structuredCloneState(state.graph) };
          state.presets.push(preset);
          await writeState(statePath, state);
          return text(`Saved "${preset.name}" (${preset.id}).`);
        }
        case 'load': {
          const m = state.presets.find((p) => (params.id && p.id === params.id) || (params.name && p.name === params.name));
          if (!m) return text(`Error: no piece matching ${params.name ?? params.id}.`);
          state.graph = normalizeGraph(m.graph);
          await writeState(statePath, state);
          return text(`Loaded "${m.name}" → ${summarize(state)}`);
        }
        case 'delete': {
          const before = state.presets.length;
          state.presets = state.presets.filter((p) => !((params.id && p.id === params.id) || (params.name && p.name === params.name)));
          if (state.presets.length === before) return text(`Error: no piece matching ${params.name ?? params.id}.`);
          await writeState(statePath, state);
          return text(`Deleted ${params.name ?? params.id}.`);
        }
      }
    },
  };

  const captureTool: ToolDefinition<typeof CaptureParams> = {
    name: 'loom_capture',
    label: 'Loom: capture',
    description: 'Persist a captured frame (PNG data URL) to the captures directory. Usually invoked by the UI camera button. Returns the saved path.',
    parameters: CaptureParams,
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const cwd = cwdFrom(ctx);
      const png = decodePng(params.dataUrl);
      if (!png) return text('Error: dataUrl must be a base64 PNG data URL.');
      const state = await readState(resolveStatePath(cwd));
      const sidecar = (params.writeSidecar ?? state.settings.capture.writeSidecarConfig) ? state.graph : null;
      const saved = await writeCapture(cwd, png, params.name ?? 'loom', sidecar);
      return text(`Saved wallpaper (${params.width}×${params.height}) → ${saved}`);
    },
  };

  pi.registerTool(getTool);
  pi.registerTool(composeTool);
  pi.registerTool(directionTool);
  pi.registerTool(randomTool);
  pi.registerTool(presetTool);
  pi.registerTool(captureTool);

  pi.registerCommand('loom-surprise', {
    description: 'Ask the agent to generate a fresh Loom piece',
    handler: async () => {
      pi.sendUserMessage('Surprise me with a brand new Loom piece using loom_random.');
    },
  });
}

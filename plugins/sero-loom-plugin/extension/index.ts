/**
 * Loom extension — Pi tools that drive the generative-art studio by mutating its
 * file-backed state. Global-scoped: state lives at $SERO_HOME/apps/loom/state.json
 * (Sero) or .sero/apps/loom/state.json relative to cwd (Pi CLI fallback).
 *
 * Tools: loom_set, loom_random, loom_preset, loom_capture
 * Command: /loom-surprise
 */

import { StringEnum } from '@earendil-works/pi-ai';
import type { ExtensionAPI, ToolDefinition } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';

import {
  clampConfig,
  mergeConfigPatch,
  randomConfig,
  structuredCloneState,
  type LoomState,
  type Paradigm,
} from '../shared/types';
import { readState, resolveStatePath, writeCapture, writeState } from './state-io';

// ── Shared schema fragments ─────────────────────────────────────

const Vec3Schema = Type.Array(Type.Number(), { minItems: 3, maxItems: 3 });
const ParadigmEnum = StringEnum(['particles', 'raymarch'] as const);

// Patch schema is intentionally lenient (additionalProperties allowed); the
// shared `mergeConfigPatch` + `clampConfig` enforce real bounds so the agent is
// never rejected for slightly out-of-range values.
const looseObj = (props: Record<string, unknown>) =>
  Type.Object(props as never, { additionalProperties: true });

const PatchSchema = looseObj({
  paradigm: Type.Optional(ParadigmEnum),
  motion: Type.Optional(
    looseObj({
      speed: Type.Optional(Type.Number()),
      turbulence: Type.Optional(Type.Number()),
      seed: Type.Optional(Type.Number()),
    }),
  ),
  palette: Type.Optional(
    looseObj({
      a: Type.Optional(Vec3Schema),
      b: Type.Optional(Vec3Schema),
      c: Type.Optional(Vec3Schema),
      d: Type.Optional(Vec3Schema),
    }),
  ),
  background: Type.Optional(Vec3Schema),
  particles: Type.Optional(
    looseObj({
      count: Type.Optional(Type.Number()),
      field: Type.Optional(StringEnum(['curl', 'lorenz', 'aizawa', 'gravity'] as const)),
      fieldStrength: Type.Optional(Type.Number()),
      noiseFrequency: Type.Optional(Type.Number()),
      noiseEvolution: Type.Optional(Type.Number()),
      pointSize: Type.Optional(Type.Number()),
      trailFade: Type.Optional(Type.Number()),
      colorMode: Type.Optional(StringEnum(['velocity', 'age', 'position'] as const)),
    }),
  ),
  raymarch: Type.Optional(
    looseObj({
      primitives: Type.Optional(
        Type.Array(
          looseObj({
            shape: Type.Optional(StringEnum(['sphere', 'box', 'torus', 'capsule'] as const)),
            position: Type.Optional(Vec3Schema),
            scale: Type.Optional(Type.Number()),
            morphAmount: Type.Optional(Type.Number()),
            morphSpeed: Type.Optional(Type.Number()),
          }),
        ),
      ),
      blendSmoothness: Type.Optional(Type.Number()),
      cameraDistance: Type.Optional(Type.Number()),
      cameraOrbitSpeed: Type.Optional(Type.Number()),
      glow: Type.Optional(Type.Number()),
      fractalIterations: Type.Optional(Type.Number()),
    }),
  ),
});

const SetParams = Type.Object({
  patch: PatchSchema,
});

const RandomParams = Type.Object({
  paradigm: Type.Optional(ParadigmEnum),
  seed: Type.Optional(Type.Number()),
});

const PresetParams = Type.Object({
  action: StringEnum(['save', 'load', 'list', 'delete'] as const),
  name: Type.Optional(Type.String({ description: 'Preset name (for save/load/delete)' })),
  id: Type.Optional(Type.String({ description: 'Preset id (for load/delete)' })),
});

const CaptureParams = Type.Object({
  dataUrl: Type.String({ description: 'PNG data URL (data:image/png;base64,...)' }),
  width: Type.Number(),
  height: Type.Number(),
  name: Type.Optional(Type.String()),
  writeSidecar: Type.Optional(Type.Boolean()),
});

// ── Helpers ─────────────────────────────────────────────────────

type ToolText = { content: { type: 'text'; text: string }[]; details: Record<string, never> };
const text = (s: string): ToolText => ({ content: [{ type: 'text', text: s }], details: {} });

function summarizeConfig(state: LoomState): string {
  const c = state.live;
  if (c.paradigm === 'particles') {
    return `particles · field=${c.particles.field} · count=${c.particles.count} · speed=${c.motion.speed}`;
  }
  return `raymarch · ${c.raymarch.primitives.length} shape(s) · blend=${c.raymarch.blendSmoothness} · speed=${c.motion.speed}`;
}

let nextPresetCounter = Date.now();
function makePresetId(): string {
  nextPresetCounter += 1;
  return `piece-${nextPresetCounter.toString(36)}`;
}

function decodePng(dataUrl: string): Buffer | null {
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl.trim());
  if (!m) return null;
  return Buffer.from(m[1], 'base64');
}

// ── Extension ───────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  let warmCwd = process.cwd();

  pi.on('session_start', async (_event, ctx) => {
    warmCwd = ctx.cwd;
  });

  const cwdFrom = (ctx?: { cwd: string }) => ctx?.cwd ?? warmCwd;

  const setTool: ToolDefinition<typeof SetParams> = {
    name: 'loom_set',
    label: 'Loom: set',
    description:
      'Change the live Loom art by merging a partial config patch. Only include the knobs you want to change (paradigm, motion, palette, background, particles, raymarch). Out-of-range values are clamped.',
    parameters: SetParams,
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const statePath = resolveStatePath(cwdFrom(ctx));
      const state = await readState(statePath);
      state.live = mergeConfigPatch(state.live, params.patch);
      await writeState(statePath, state);
      return text(`Updated Loom → ${summarizeConfig(state)}`);
    },
  };

  const randomTool: ToolDefinition<typeof RandomParams> = {
    name: 'loom_random',
    label: 'Loom: random',
    description: 'Generate and apply a fresh randomized Loom piece. Optionally constrain the paradigm or pass a seed for reproducibility.',
    parameters: RandomParams,
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const statePath = resolveStatePath(cwdFrom(ctx));
      const state = await readState(statePath);
      state.live = randomConfig({ paradigm: params.paradigm as Paradigm | undefined, seed: params.seed });
      await writeState(statePath, state);
      return text(`New random piece → ${summarizeConfig(state)} (seed ${state.live.motion.seed})`);
    },
  };

  const presetTool: ToolDefinition<typeof PresetParams> = {
    name: 'loom_preset',
    label: 'Loom: preset',
    description: 'Manage saved Loom pieces. Actions: save (name), load (name|id), list, delete (name|id).',
    parameters: PresetParams,
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const statePath = resolveStatePath(cwdFrom(ctx));
      const state = await readState(statePath);

      switch (params.action) {
        case 'list': {
          if (state.presets.length === 0) return text('No saved pieces yet.');
          return text(state.presets.map((p) => `• ${p.name} (${p.id})`).join('\n'));
        }
        case 'save': {
          if (!params.name) return text('Error: name is required to save a piece.');
          const preset = {
            id: makePresetId(),
            name: params.name,
            createdAt: Date.now(),
            config: structuredCloneState(state.live),
          };
          state.presets.push(preset);
          await writeState(statePath, state);
          return text(`Saved piece "${preset.name}" (${preset.id}).`);
        }
        case 'load': {
          const match = state.presets.find(
            (p) => (params.id && p.id === params.id) || (params.name && p.name === params.name),
          );
          if (!match) return text(`Error: no saved piece matching ${params.name ?? params.id}.`);
          state.live = clampConfig(match.config);
          await writeState(statePath, state);
          return text(`Loaded "${match.name}" → ${summarizeConfig(state)}`);
        }
        case 'delete': {
          const before = state.presets.length;
          state.presets = state.presets.filter(
            (p) => !((params.id && p.id === params.id) || (params.name && p.name === params.name)),
          );
          if (state.presets.length === before) {
            return text(`Error: no saved piece matching ${params.name ?? params.id}.`);
          }
          await writeState(statePath, state);
          return text(`Deleted piece ${params.name ?? params.id}.`);
        }
      }
    },
  };

  const captureTool: ToolDefinition<typeof CaptureParams> = {
    name: 'loom_capture',
    label: 'Loom: capture',
    description: 'Persist a captured Loom frame (PNG data URL) to the captures directory. Usually invoked by the UI camera button. Returns the saved file path.',
    parameters: CaptureParams,
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const cwd = cwdFrom(ctx);
      const png = decodePng(params.dataUrl);
      if (!png) return text('Error: dataUrl must be a base64 PNG data URL.');
      const state = await readState(resolveStatePath(cwd));
      const sidecar = (params.writeSidecar ?? state.settings.capture.writeSidecarConfig)
        ? state.live
        : null;
      const saved = await writeCapture(cwd, png, params.name ?? 'loom', sidecar);
      return text(`Saved wallpaper (${params.width}×${params.height}) → ${saved}`);
    },
  };

  pi.registerTool(setTool);
  pi.registerTool(randomTool);
  pi.registerTool(presetTool);
  pi.registerTool(captureTool);

  // Distinct from any tool name so it doesn't shadow a bridged CLI entry point.
  pi.registerCommand('loom-surprise', {
    description: 'Ask the agent to generate a fresh Loom piece',
    handler: async () => {
      pi.sendUserMessage('Surprise me with a brand new Loom piece using the loom_random tool.');
    },
  });
}

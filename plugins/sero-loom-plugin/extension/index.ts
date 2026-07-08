/**
 * Loom extension — Pi tools the agent uses to author generative art as real
 * multi-pass GLSL (Shadertoy conventions) in the plugin's file-backed state.
 *
 * Global-scoped: $SERO_HOME/apps/loom/state.json (Sero) or
 * .sero/apps/loom/state.json relative to cwd (Pi CLI fallback).
 *
 * Tools: loom_get, loom_compose, loom_see, loom_direction, loom_preset, loom_capture
 * Command: /loom-surprise
 *
 * Compile feedback: only the UI has a GL context, so loom_compose bumps
 * `revision`, writes atomically, and waits (fs.watch, push not polling) for the
 * UI's BuildReport for that revision. loom_see works the same way: it writes a
 * SeeRequest, the UI renders frames and hands them back through loom_capture,
 * and the images return to the agent as image content blocks.
 */

import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

import { StringEnum } from '@earendil-works/pi-ai';
import type { ExtensionAPI, ToolDefinition } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';

import {
  normalizePiece,
  structuredCloneState,
  type BuildReport,
  type LoomPiece,
  type LoomState,
} from '../shared/types';
import {
  readState,
  resolveStatePath,
  updateLoomState,
  waitForState,
  writeCapture,
  writeSeeFrames,
} from './state-io';

const BUILD_WAIT_MS = 6_000;
const FPS_SETTLE_WAIT_MS = 2_500;
const SEE_WAIT_MS = 25_000;

type Content = { type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string };
type ToolResult = { content: Content[]; details: Record<string, never> };
const text = (s: string): ToolResult => ({ content: [{ type: 'text', text: s }], details: {} });

function decodeDataUrl(dataUrl: string): { buf: Buffer; mime: string } | null {
  const m = /^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl.trim());
  return m ? { buf: Buffer.from(m[2], 'base64'), mime: m[1] } : null;
}

function summarize(piece: LoomPiece): string {
  const buffers = piece.passes.filter((p) => p.id !== 'image').map((p) => p.id);
  const passText = buffers.length ? `passes ${buffers.join('+')}+image` : '1 image pass';
  return `"${piece.title}" — ${passText}, ${piece.params.length} param(s)`;
}

function buildText(build: BuildReport | undefined, revision: number): string {
  if (!build || build.revision !== revision) {
    return 'Applied — not compiled yet (the Loom UI is not open to verify). Call loom_get later for the build report, or ask the user to open Loom.';
  }
  if (build.status === 'ok') {
    const fps = build.fps ? ` at ~${build.fps} fps` : '';
    return `Build OK${fps}. Call loom_see once before the final note.`;
  }
  const lines = build.errors.slice(0, 12).map((e) => `  • [${e.pass}${e.line !== null ? `:${e.line}` : ''}] ${e.message}`);
  return `Build FAILED — the previous piece is still on screen. Fix and re-compose:\n${lines.join('\n')}`;
}

/** Shallow patch: scalar/array fields replace, paramValues merges by key. */
function applyPatch(current: LoomPiece, patch: unknown): LoomPiece {
  if (typeof patch !== 'object' || patch === null || Array.isArray(patch)) return normalizePiece(current);
  const p = patch as Record<string, unknown>;
  const next: Record<string, unknown> = { ...structuredCloneState(current) };
  for (const key of ['title', 'idea', 'common', 'passes', 'params'] as const) {
    if (p[key] !== undefined) next[key] = p[key];
  }
  if (typeof p.paramValues === 'object' && p.paramValues !== null) {
    next.paramValues = { ...(next.paramValues as Record<string, unknown>), ...(p.paramValues as Record<string, unknown>) };
  }
  return normalizePiece(next);
}

let presetCounter = Date.now();
const makePresetId = () => `piece-${(presetCounter++).toString(36)}`;

// ── Schemas ─────────────────────────────────────────────────────

const GetParams = Type.Object({});
const ComposeParams = Type.Object({
  piece: Type.Optional(Type.Unknown({ description: 'Full piece: { title, idea, common?, passes, params, paramValues }' })),
  patch: Type.Optional(Type.Unknown({ description: 'Partial piece; passes/params replace whole lists, paramValues merges by key' })),
});
const SeeParams = Type.Object({
  frames: Type.Optional(Type.Number({ description: '1..3 frames (use 2+ to judge motion)', minimum: 1, maximum: 3 })),
  spacingSeconds: Type.Optional(Type.Number({ description: 'Simulated seconds between frames (default 2)' })),
  width: Type.Optional(Type.Number({ description: 'Frame width in px (default 768)' })),
});
const DirectionParams = Type.Object({
  action: StringEnum(['get', 'set'] as const),
  guidance: Type.Optional(Type.String({ description: 'Persistent creative direction (for set)' })),
});
const PresetParams = Type.Object({
  action: StringEnum(['save', 'load', 'list', 'delete'] as const),
  name: Type.Optional(Type.String()),
  id: Type.Optional(Type.String()),
});
const CaptureParams = Type.Object({
  purpose: Type.Optional(StringEnum(['wallpaper', 'see'] as const)),
  dataUrl: Type.Optional(Type.String({ description: 'PNG data URL (wallpaper)' })),
  dataUrls: Type.Optional(Type.Array(Type.String(), { description: 'JPEG data URLs (see fulfilment)' })),
  requestId: Type.Optional(Type.String({ description: 'SeeRequest id being fulfilled' })),
  width: Type.Optional(Type.Number()),
  height: Type.Optional(Type.Number()),
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

  const composePiece = async (statePath: string, next: (s: LoomState) => LoomPiece): Promise<string> => {
    const state = await updateLoomState(statePath, (s) => {
      s.piece = next(s);
      s.revision += 1;
    });
    let built = await waitForState(statePath, (s) => s.build?.revision === state.revision, BUILD_WAIT_MS);
    // The first build write carries no fps (it settles ~1.5s later at the same
    // revision). Wait a bounded moment so the agent sees the frame cost it is
    // told to reason about; fall back to the fps-less report if none arrives.
    if (built?.build?.status === 'ok' && built.build.fps === undefined) {
      const withFps = await waitForState(
        statePath,
        (s) => s.build?.revision === state.revision && s.build.fps !== undefined,
        FPS_SETTLE_WAIT_MS,
      );
      if (withFps) built = withFps;
    }
    return `${summarize(state.piece)}\n${buildText(built?.build, state.revision)}`;
  };

  const getTool: ToolDefinition<typeof GetParams> = {
    name: 'loom_get',
    label: 'Loom: get',
    description:
      'Read the current Loom piece (full GLSL + params), the latest build report, the persistent creative direction, and the preset index. Call this BEFORE composing so you build on what is there.',
    parameters: GetParams,
    async execute(_id, _params, _signal, _onUpdate, ctx) {
      const state = await readState(resolveStatePath(cwdFrom(ctx)));
      const payload = {
        direction: state.direction.guidance,
        revision: state.revision,
        build: state.build ?? null,
        piece: state.piece,
        presets: state.presets.map((p) => ({ id: p.id, name: p.name, legacy: !p.piece })),
      };
      return text(JSON.stringify(payload, null, 2));
    },
  };

  const composeTool: ToolDefinition<typeof ComposeParams> = {
    name: 'loom_compose',
    label: 'Loom: compose',
    description:
      'Author GPU-light live art as real GLSL (Shadertoy conventions: mainImage, iTime, iResolution, iMouse, iChannel0-3; multi-pass A-D + image with ping-pong feedback). Prefer one image pass, or one 0.5-scale buffer pass at most for first drafts. Pass a full `piece` or a `patch`. Declare 3-6 params (slider/color/toggle/xy) bound as u_<name> uniforms — param value changes tween live without recompiling. Returns the compile result: fix any errors immediately, then loom_see once.',
    parameters: ComposeParams,
    async execute(_id, params, _signal, _onUpdate, ctx) {
      if (params.piece === undefined && params.patch === undefined) {
        return text('Error: provide `piece` (full) or `patch` (partial).');
      }
      const statePath = resolveStatePath(cwdFrom(ctx));
      const result = await composePiece(statePath, (s) =>
        params.piece !== undefined ? normalizePiece(params.piece) : applyPatch(s.piece, params.patch),
      );
      return text(`Composed → ${result}`);
    },
  };

  const seeTool: ToolDefinition<typeof SeeParams> = {
    name: 'loom_see',
    label: 'Loom: see',
    description:
      'Look at the current piece: the Loom UI renders 1-3 frames (spaced in simulated time to judge motion) and they come back as images. Use after the first successful compose; refine only for obvious mismatch, blank output, broken composition, or harsh artefacts.',
    parameters: SeeParams,
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const cwd = cwdFrom(ctx);
      const statePath = resolveStatePath(cwd);
      const id = `see-${randomUUID().slice(0, 8)}`;
      const request = {
        id,
        frames: Math.round(Math.min(3, Math.max(1, params.frames ?? 1))),
        spacingSeconds: Math.min(10, Math.max(0.1, params.spacingSeconds ?? 2)),
        width: Math.round(Math.min(1600, Math.max(256, params.width ?? 768))),
      };
      await updateLoomState(statePath, (s) => {
        s.seeRequest = request;
        delete s.seeResult;
      });
      const state = await waitForState(statePath, (s) => s.seeResult?.id === id, SEE_WAIT_MS);
      if (!state?.seeResult) {
        await updateLoomState(statePath, (s) => {
          if (s.seeRequest?.id === id) delete s.seeRequest;
        });
        return text('The Loom UI is not open, so I cannot render frames. Ask the user to open Loom, or continue without visual feedback.');
      }
      if (state.seeResult.error) return text(`Loom could not capture frames: ${state.seeResult.error}`);

      const content: Content[] = [];
      for (let i = 0; i < state.seeResult.paths.length; i++) {
        const data = await readFile(state.seeResult.paths[i]).then(
          (b) => b.toString('base64'),
          () => null,
        );
        if (!data) continue;
        content.push({ type: 'text', text: `Frame ${i + 1}/${state.seeResult.paths.length} (t+${(i * request.spacingSeconds).toFixed(1)}s):` });
        content.push({ type: 'image', data, mimeType: 'image/jpeg' });
      }
      if (content.length === 0) return text('Frames were reported but could not be read from disk.');
      return { content, details: {} };
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
      if (params.action === 'get') {
        const state = await readState(statePath);
        return text(state.direction.guidance || '(no creative direction set)');
      }
      await updateLoomState(statePath, (s) => {
        s.direction.guidance = params.guidance ?? '';
      });
      return text('Creative direction updated.');
    },
  };

  const presetTool: ToolDefinition<typeof PresetParams> = {
    name: 'loom_preset',
    label: 'Loom: preset',
    description:
      'Manage the gallery. Actions: save (name), load (name|id), list, delete (name|id). Legacy presets (from the pre-shader Loom) return their old graph JSON so you can recreate the look as GLSL.',
    parameters: PresetParams,
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const statePath = resolveStatePath(cwdFrom(ctx));
      const matches = (p: { id: string; name: string }) =>
        (params.id && p.id === params.id) || (params.name && p.name === params.name);

      switch (params.action) {
        case 'list': {
          const state = await readState(statePath);
          if (state.presets.length === 0) return text('No saved pieces yet.');
          return text(state.presets.map((p) => `• ${p.name} (${p.id})${p.piece ? '' : ' [legacy — recreate to load]'}`).join('\n'));
        }
        case 'save': {
          if (!params.name) return text('Error: name is required.');
          let id = '';
          await updateLoomState(statePath, (s) => {
            id = makePresetId();
            s.presets.push({ id, name: params.name!, createdAt: Date.now(), piece: structuredCloneState(s.piece) });
          });
          return text(`Saved "${params.name}" (${id}).`);
        }
        case 'load': {
          const state = await readState(statePath);
          const preset = state.presets.find(matches);
          if (!preset) return text(`Error: no piece matching ${params.name ?? params.id}.`);
          if (!preset.piece) {
            return text(
              `"${preset.name}" is a legacy piece from the pre-shader Loom. Recreate its look as GLSL with loom_compose, using its old graph as the brief:\n${JSON.stringify(preset.legacyGraph, null, 2)}`,
            );
          }
          const piece = preset.piece;
          const result = await composePiece(statePath, () => structuredCloneState(piece));
          return text(`Loaded → ${result}`);
        }
        case 'delete': {
          let removed = false;
          await updateLoomState(statePath, (s) => {
            const before = s.presets.length;
            s.presets = s.presets.filter((p) => !matches(p));
            removed = s.presets.length !== before;
          });
          return removed ? text(`Deleted ${params.name ?? params.id}.`) : text(`Error: no piece matching ${params.name ?? params.id}.`);
        }
      }
    },
  };

  const captureTool: ToolDefinition<typeof CaptureParams> = {
    name: 'loom_capture',
    label: 'Loom: capture',
    description:
      'Persist rendered frames to disk. purpose "wallpaper" (default): write a high-res PNG (+ optional sidecar piece JSON) to the captures directory. purpose "see": internal — the UI fulfilling a loom_see request.',
    parameters: CaptureParams,
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const cwd = cwdFrom(ctx);
      const statePath = resolveStatePath(cwd);

      if (params.purpose === 'see') {
        if (!params.requestId || !params.dataUrls?.length) return text('Error: see fulfilment needs requestId and dataUrls.');
        const frames = params.dataUrls.map(decodeDataUrl).filter((f): f is NonNullable<typeof f> => f !== null);
        if (frames.length === 0) return text('Error: no decodable frames.');
        const paths = await writeSeeFrames(cwd, params.requestId, frames.map((f) => f.buf));
        await updateLoomState(statePath, (s) => {
          s.seeResult = { id: params.requestId!, paths };
          if (s.seeRequest?.id === params.requestId) delete s.seeRequest;
        });
        return text(`Wrote ${paths.length} frame(s).`);
      }

      if (!params.dataUrl) return text('Error: dataUrl is required for wallpaper capture.');
      const png = decodeDataUrl(params.dataUrl);
      if (!png || png.mime !== 'image/png') return text('Error: dataUrl must be a base64 PNG data URL.');
      const state = await readState(statePath);
      const sidecar = (params.writeSidecar ?? state.settings.capture.writeSidecarConfig) ? state.piece : null;
      const saved = await writeCapture(cwd, png.buf, params.name ?? state.piece.title, sidecar);
      const dims = params.width && params.height ? ` (${params.width}×${params.height})` : '';
      return text(`Saved wallpaper${dims} → ${saved}`);
    },
  };

  pi.registerTool(getTool);
  pi.registerTool(composeTool);
  pi.registerTool(seeTool);
  pi.registerTool(directionTool);
  pi.registerTool(presetTool);
  pi.registerTool(captureTool);

  pi.registerCommand('loom-surprise', {
    description: 'Ask the agent to invent a fresh Loom piece',
    handler: async () => {
      pi.sendUserMessage(
        'Invent a brand new Loom piece — a concept the gallery does not have yet. ' +
          'Read the current state with loom_get, compose it as GLSL with loom_compose, ' +
          'then look once with loom_see and make at most one quick refinement unless it is clearly broken.',
      );
    },
  });
}

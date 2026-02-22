/**
 * ImageGen Pi extension — tool + command for Gemini Nano Banana image generation.
 *
 * Tool: generate_image — called by the LLM agent to create images.
 * Command: /generate-image — user-invokable shortcut.
 *
 * When running inside Sero, delegates to the image agent via globalThis bridge.
 * The bridge is registered by electron/ipc/imagegen.ts on startup.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { StringEnum } from '@mariozechner/pi-ai';
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { Text } from '@mariozechner/pi-tui';
import { Type } from '@sinclair/typebox';

import type { ImageGenState, Generation, GenerateParams } from '../shared/types';
import { DEFAULT_STATE } from '../shared/types';

// ── Paths ──

const STATE_REL = path.join('.sero', 'apps', 'imagegen', 'state.json');
const IMAGES_REL = path.join('.sero', 'apps', 'imagegen', 'images');

function resolveStatePath(cwd: string): string {
  return path.join(cwd, STATE_REL);
}

// ── State I/O ──

async function readState(filePath: string): Promise<ImageGenState> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw) as ImageGenState;
  } catch {
    return { ...DEFAULT_STATE };
  }
}

async function writeState(filePath: string, state: ImageGenState): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const tmp = `${filePath}.tmp.${Date.now()}`;
  await fs.writeFile(tmp, JSON.stringify(state, null, 2), 'utf8');
  await fs.rename(tmp, filePath);
}

// ── Tool parameters ──

const Params = Type.Object({
  prompt: Type.String({ description: 'Text description of the image to generate' }),
  model: Type.Optional(
    StringEnum(['flash', 'pro'] as const, {
      description: 'Model: "flash" = Nano Banana (fast), "pro" = Nano Banana Pro (high-fidelity). Default: flash',
    }),
  ),
  variations: Type.Optional(
    Type.Number({ description: 'Number of image variations (1-4). Default: 1', minimum: 1, maximum: 4 }),
  ),
  aspect_ratio: Type.Optional(
    StringEnum(['1:1', '2:3', '3:2', '3:4', '4:3', '9:16', '16:9'] as const, {
      description: 'Aspect ratio. Default: 1:1',
    }),
  ),
  negative_prompt: Type.Optional(
    Type.String({ description: 'What to avoid in the image' }),
  ),
});

type ModelAlias = 'flash' | 'pro';
const MODEL_MAP: Record<ModelAlias, GenerateParams['model']> = {
  flash: 'gemini-2.5-flash-image',
  pro: 'gemini-3-pro-image-preview',
};

// ── Extension entry point ──

export default function (pi: ExtensionAPI) {
  let statePath = '';

  pi.on('session_start', async (_event, ctx) => {
    statePath = resolveStatePath(ctx.cwd);
  });
  pi.on('session_switch', async (_event, ctx) => {
    statePath = resolveStatePath(ctx.cwd);
  });

  // ── Tool ──

  pi.registerTool({
    name: 'generate_image',
    label: 'Generate Image',
    description:
      'Generate images using Google Gemini Nano Banana. ' +
      'Supports two models: "flash" (fast, efficient) and "pro" (high-fidelity with thinking). ' +
      'Can generate 1-4 variations. Supports aspect ratios: 1:1, 2:3, 3:2, 3:4, 4:3, 9:16, 16:9.',
    parameters: Params,

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const cwd = ctx?.cwd;
      const resolvedPath = cwd ? resolveStatePath(cwd) : statePath;
      if (!resolvedPath) {
        return { content: [{ type: 'text', text: 'Error: no workspace cwd' }], details: {} };
      }
      statePath = resolvedPath;

      const alias = (params.model ?? 'flash') as ModelAlias;
      const genParams: GenerateParams = {
        prompt: params.prompt,
        model: MODEL_MAP[alias] ?? 'gemini-2.5-flash-image',
        variations: params.variations ?? 1,
        aspectRatio: (params.aspect_ratio as any) ?? '1:1',
        negativePrompt: params.negative_prompt,
      };

      try {
        const imagesDir = cwd
          ? path.join(cwd, IMAGES_REL)
          : path.join(path.dirname(resolvedPath), 'images');

        // Use Sero image agent bridge if available, otherwise error
        const seroGen = (globalThis as any).__seroImageGen;
        if (!seroGen) {
          return {
            content: [{ type: 'text', text: 'Error: Image generation requires Sero desktop app.' }],
            details: {},
          };
        }

        const result = await seroGen(genParams, imagesDir);

        if (!result.images || result.images.length === 0) {
          return {
            content: [{ type: 'text', text: `Error: ${result.error ?? 'No images generated'}` }],
            details: {},
          };
        }

        // Update state
        const state = await readState(statePath);
        const generation: Generation = {
          id: state.nextId,
          prompt: genParams.prompt,
          negativePrompt: genParams.negativePrompt,
          model: genParams.model,
          aspectRatio: genParams.aspectRatio,
          images: result.images,
          createdAt: new Date().toISOString(),
        };
        state.generations.unshift(generation);
        state.nextId++;
        await writeState(statePath, state);

        const count = result.images.length;
        const modelName = alias === 'pro' ? 'Nano Banana Pro' : 'Nano Banana';
        const text = `Generated ${count} image${count > 1 ? 's' : ''} with ${modelName} (${genParams.aspectRatio}).\nPrompt: "${genParams.prompt}"`;

        return { content: [{ type: 'text', text }], details: {} };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: 'text', text: `Error: ${msg}` }], details: {} };
      }
    },

    renderCall(args, theme) {
      const model = args.model === 'pro' ? 'Pro' : 'Flash';
      let text = theme.fg('toolTitle', theme.bold('generate_image '));
      text += theme.fg('muted', `[${model}] `);
      text += theme.fg('dim', `"${args.prompt}"`);
      return new Text(text, 0, 0);
    },

    renderResult(result, _options, theme) {
      const msg = result.content[0];
      const text = msg?.type === 'text' ? msg.text : '';
      return new Text(
        text.startsWith('Error:')
          ? theme.fg('error', text)
          : theme.fg('success', '🎨 ') + theme.fg('muted', text),
        0, 0,
      );
    },
  });

  // ── Command ──

  pi.registerCommand('generate-image', {
    description: 'Generate an image with Gemini Nano Banana',
    handler: async (args, _ctx) => {
      const prompt = args.trim();
      if (!prompt) {
        pi.sendUserMessage(
          'I want to generate an image. Ask me what I\'d like to create, then use the generate_image tool.',
        );
      } else {
        pi.sendUserMessage(
          `Generate an image with this prompt using the generate_image tool: "${prompt}"`,
        );
      }
    },
  });
}

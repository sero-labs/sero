/**
 * Image generation agent — uses Pi SDK auth + @google/genai for Gemini image generation.
 *
 * Supports two Nano Banana models:
 *   - gemini-2.5-flash-image  (Nano Banana — fast / efficient)
 *   - gemini-3-pro-image-preview (Nano Banana Pro — high-fidelity)
 *
 * Uses the same @google/genai client that the Pi SDK uses internally,
 * with auth resolved through Pi's AuthStorage.
 */

import { GoogleGenAI } from '@google/genai';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

import { ensureInfra } from '@electron/shared/infra/shared-infra';

// ── Types (mirrored from shared/types.ts to avoid cross-package import) ──

export type ImageModel = 'gemini-2.5-flash-image' | 'gemini-3-pro-image-preview';
export type AspectRatio = '1:1' | '2:3' | '3:2' | '3:4' | '4:3' | '9:16' | '16:9';

export interface ImageAttachment {
  id: string;
  dataUri: string;
  mimeType: string;
  filename: string;
}

export interface ImageGenParams {
  prompt: string;
  model: ImageModel;
  variations: number;
  aspectRatio: AspectRatio;
  negativePrompt?: string;
  attachments?: ImageAttachment[];
}

export interface GeneratedImageResult {
  id: string;
  filePath: string;
  mimeType: string;
}

export interface ImageGenResult {
  images: GeneratedImageResult[];
  error?: string;
}

// ── Auth providers to try in order ──

const AUTH_PROVIDERS = ['google-gemini-cli', 'google', 'google-vertex'] as const;

async function resolveApiKey(): Promise<string> {
  // 1. Prefer GEMINI_API_KEY env var — it's a real API key that works
  //    with the standard generativelanguage.googleapis.com endpoint.
  //    OAuth tokens (google-gemini-cli) target Cloud Code Assist and
  //    are rejected by the standard endpoint as invalid API keys.
  const envKey = process.env.GEMINI_API_KEY;
  if (envKey) return envKey;

  // 2. Try Pi SDK auth providers (API-key-based ones like 'google')
  try {
    const infra = await ensureInfra();
    for (const provider of AUTH_PROVIDERS) {
      const key = await infra.authStorage.getApiKey(provider);
      if (key) return key;
    }
  } catch {
    // Swallow — no providers available
  }

  throw new Error(
    'No Google API key found. Set GEMINI_API_KEY or add a Google API key via /login.',
  );
}

// ── Core generation ──

export async function generateImages(
  params: ImageGenParams,
  imagesDir: string,
): Promise<ImageGenResult> {
  const apiKey = await resolveApiKey();
  const client = new GoogleGenAI({ apiKey });

  await fs.mkdir(imagesDir, { recursive: true });

  const count = Math.min(Math.max(params.variations, 1), 4);
  const results: GeneratedImageResult[] = [];
  const errors: string[] = [];

  // Build content parts: text prompt + any attached images
  const parts = buildContentParts(params);

  // Run variations in parallel
  const jobs = Array.from({ length: count }, async (_, i) => {
    try {
      const response = await client.models.generateContent({
        model: params.model,
        contents: [{ parts }],
        config: {
          responseModalities: ['IMAGE', 'TEXT'],
          imageConfig: {
            aspectRatio: params.aspectRatio,
          },
        },
      });

      // Extract image data from response
      const responseParts = response.candidates?.[0]?.content?.parts ?? [];
      for (const part of responseParts) {
        if (part.inlineData?.data) {
          const ext = mimeToExt(part.inlineData.mimeType ?? 'image/png');
          const id = crypto.randomUUID();
          const fileName = `${id}.${ext}`;
          const filePath = path.join(imagesDir, fileName);

          await fs.writeFile(filePath, Buffer.from(part.inlineData.data, 'base64'));

          results.push({
            id,
            filePath,
            mimeType: part.inlineData.mimeType ?? 'image/png',
          });
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[image-agent] Variation ${i + 1} failed:`, msg);
      errors.push(msg);
    }
  });

  await Promise.all(jobs);

  if (results.length === 0 && errors.length > 0) {
    return { images: [], error: errors[0] };
  }

  return { images: results, error: errors.length > 0 ? errors.join('; ') : undefined };
}

function buildPromptText(params: ImageGenParams): string {
  let prompt = params.prompt;
  if (params.negativePrompt) {
    prompt += `\n\nAvoid: ${params.negativePrompt}`;
  }
  return prompt;
}

/** Strip the `data:<mime>;base64,` prefix from a data URI. */
function stripDataUriPrefix(dataUri: string): string {
  const idx = dataUri.indexOf(',');
  return idx >= 0 ? dataUri.slice(idx + 1) : dataUri;
}

/**
 * Build multimodal content parts: attached images first, then the text prompt.
 * Gemini expects image parts before the text instruction for best results.
 */
function buildContentParts(params: ImageGenParams): Array<Record<string, any>> {
  const parts: Array<Record<string, any>> = [];

  for (const att of params.attachments ?? []) {
    parts.push({
      inlineData: {
        mimeType: att.mimeType,
        data: stripDataUriPrefix(att.dataUri),
      },
    });
  }

  parts.push({ text: buildPromptText(params) });
  return parts;
}

function mimeToExt(mime: string): string {
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
  if (mime.includes('webp')) return 'webp';
  return 'png';
}

// ── Expose on globalThis for extension bridge ──

export function exposeImageAgent(): void {
  (globalThis as any).__seroImageGen = generateImages;
}

// shared/types.ts — Single source of truth for ImageGen state + params.

export type ImageModel = 'gemini-2.5-flash-image' | 'gemini-3-pro-image-preview';
export type AspectRatio = '1:1' | '2:3' | '3:2' | '3:4' | '4:3' | '9:16' | '16:9';

/** An image attached to a generation prompt (for editing / remixing). */
export interface ImageAttachment {
  id: string;
  /** Full data URI (data:image/…;base64,…) */
  dataUri: string;
  mimeType: string;
  filename: string;
}

export interface GenerateParams {
  prompt: string;
  model: ImageModel;
  variations: number;       // 1–4
  aspectRatio: AspectRatio;
  negativePrompt?: string;
  /** Reference images for editing / remixing. */
  attachments?: ImageAttachment[];
}

export interface GeneratedImage {
  id: string;
  /** Absolute path to the PNG on disk. */
  filePath: string;
  mimeType: string;
}

export interface Generation {
  id: number;
  prompt: string;
  negativePrompt?: string;
  model: ImageModel;
  aspectRatio: AspectRatio;
  images: GeneratedImage[];
  createdAt: string; // ISO
}

export interface ImageGenState {
  generations: Generation[];
  nextId: number;
}

export const DEFAULT_STATE: ImageGenState = {
  generations: [],
  nextId: 1,
};

/** Result returned by the image agent / IPC handler. */
export interface GenerateResult {
  generation: Generation;
  error?: string;
}

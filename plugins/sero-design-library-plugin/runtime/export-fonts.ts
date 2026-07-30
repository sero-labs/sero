import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

import { designFontFaces } from '../shared/fonts';

const require = createRequire(import.meta.url);

const FONT_MODULES: Record<string, string> = {
  'inter-latin': '@fontsource-variable/inter/files/inter-latin-wght-normal.woff2',
  'geist-latin': '@fontsource-variable/geist/files/geist-latin-wght-normal.woff2',
  'space-grotesk-latin': '@fontsource-variable/space-grotesk/files/space-grotesk-latin-wght-normal.woff2',
  'ibm-plex-sans-latin': '@fontsource-variable/ibm-plex-sans/files/ibm-plex-sans-latin-wght-normal.woff2',
  'jetbrains-mono-latin': '@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2',
  'ibm-plex-mono-latin-300': '@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-300-normal.woff2',
  'ibm-plex-mono-latin-400': '@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2',
  'ibm-plex-mono-latin-500': '@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff2',
  'ibm-plex-mono-latin-600': '@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-600-normal.woff2',
  'ibm-plex-mono-latin-700': '@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-700-normal.woff2',
};

export interface ExportedFontFile {
  id: string;
  file: string;
  family: string;
  weight: string;
  bytes: number;
  checksum: string;
}

function checksum(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** Copy only the local Design fonts selected by the saved tweak values. */
export async function exportDesignFonts(
  destination: string,
  fontStacks: readonly string[],
): Promise<{ files: ExportedFontFile[]; css: string }> {
  const faces = [...new Map(
    fontStacks.flatMap((stack) => designFontFaces(stack)).map((face) => [face.id, face]),
  ).values()];
  if (faces.length === 0) return { files: [], css: '' };

  const fontDir = path.join(destination, 'fonts');
  await mkdir(fontDir, { recursive: true });
  const files = await Promise.all(faces.map(async (face): Promise<ExportedFontFile> => {
    const moduleName = FONT_MODULES[face.id];
    if (!moduleName) throw new Error(`The saved font ${face.family} is not bundled with this plugin.`);
    const source = require.resolve(moduleName);
    const name = `${face.id}.woff2`;
    const bytes = await readFile(source);
    await copyFile(source, path.join(fontDir, name));
    return {
      id: face.id,
      file: `fonts/${name}`,
      family: face.family,
      weight: face.weight,
      bytes: bytes.byteLength,
      checksum: checksum(bytes),
    };
  }));
  const css = files.map((file) => `@font-face {
  font-family: ${JSON.stringify(file.family)};
  src: url(${JSON.stringify(`./${file.file}`)}) format("woff2");
  font-style: normal;
  font-weight: ${file.weight};
  font-display: swap;
}`).join('\n\n');
  return { files, css };
}

import geistUrl from '@fontsource-variable/geist/files/geist-latin-wght-normal.woff2?url';
import ibmPlexSansUrl from '@fontsource-variable/ibm-plex-sans/files/ibm-plex-sans-latin-wght-normal.woff2?url';
import interUrl from '@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url';
import jetbrainsMonoUrl from '@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2?url';
import spaceGroteskUrl from '@fontsource-variable/space-grotesk/files/space-grotesk-latin-wght-normal.woff2?url';
import ibmPlexMono300Url from '@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-300-normal.woff2?url';
import ibmPlexMono400Url from '@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2?url';
import ibmPlexMono500Url from '@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff2?url';
import ibmPlexMono600Url from '@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-600-normal.woff2?url';
import ibmPlexMono700Url from '@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-700-normal.woff2?url';

import {
  DESIGN_FONT_OPTIONS,
  designFontFaces,
  type DesignFontFace,
} from '../../shared/fonts';

const FONT_ASSET_URLS: Record<string, string> = {
  'inter-latin': interUrl,
  'geist-latin': geistUrl,
  'space-grotesk-latin': spaceGroteskUrl,
  'ibm-plex-sans-latin': ibmPlexSansUrl,
  'jetbrains-mono-latin': jetbrainsMonoUrl,
  'ibm-plex-mono-latin-300': ibmPlexMono300Url,
  'ibm-plex-mono-latin-400': ibmPlexMono400Url,
  'ibm-plex-mono-latin-500': ibmPlexMono500Url,
  'ibm-plex-mono-latin-600': ibmPlexMono600Url,
  'ibm-plex-mono-latin-700': ibmPlexMono700Url,
};

export interface LoadedDesignFontFace extends DesignFontFace {
  bytes: ArrayBuffer;
}

const bytesById = new Map<string, Promise<ArrayBuffer | null>>();
const installed = new Set<string>();

function readFontAsset(face: DesignFontFace): Promise<ArrayBuffer | null> {
  const current = bytesById.get(face.id);
  if (current !== undefined) return current;
  const url = FONT_ASSET_URLS[face.id];
  const pending =
    url === undefined
      ? Promise.resolve(null)
      : fetch(url)
          .then((response) => (response.ok ? response.arrayBuffer() : null))
          .catch(() => null);
  bytesById.set(face.id, pending);
  return pending;
}

/** Bundled font bytes for the isolated preview. No external URL enters the frame. */
export async function designFontAssets(fontStack: string): Promise<LoadedDesignFontFace[]> {
  const loaded = await Promise.all(
    designFontFaces(fontStack).map(async (face) => {
      const bytes = await readFontAsset(face);
      return bytes === null ? null : { ...face, bytes };
    }),
  );
  return loaded.filter((face): face is LoadedDesignFontFace => face !== null);
}

export function loadDesignFont(fontStack: string): void {
  if (typeof FontFace !== 'function') return;
  void designFontAssets(fontStack).then((faces) => {
    for (const face of faces) {
      if (installed.has(face.id)) continue;
      installed.add(face.id);
      const font = new FontFace(face.family, face.bytes.slice(0), {
        style: 'normal',
        weight: face.weight,
      });
      void font
        .load()
        .then((loaded) => document.fonts.add(loaded))
        .catch(() => installed.delete(face.id));
    }
  });
}

export function preloadDesignFonts(): void {
  for (const option of DESIGN_FONT_OPTIONS) loadDesignFont(option.value);
}

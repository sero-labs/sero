/** Compute simple text statistics for display. */

export interface TextStats {
  words: number;
  chars: number;
  readingTime: string; // e.g. "< 1 min", "2 min"
}

export function computeStats(text: string): TextStats {
  const trimmed = text.trim();
  if (!trimmed) return { words: 0, chars: 0, readingTime: '0 min' };

  const words = trimmed.split(/\s+/).length;
  const chars = trimmed.length;
  const minutes = Math.floor(words / 200);
  const readingTime = minutes < 1 ? '< 1 min' : `${minutes} min`;

  return { words, chars, readingTime };
}

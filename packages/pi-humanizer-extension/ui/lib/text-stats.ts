/** Compute simple text statistics for display. */

export interface TextStats {
  words: number;
  chars: number;
  sentences: number;
  readingTime: string; // e.g. "< 1 min", "2 min"
}

export function computeStats(text: string): TextStats {
  const trimmed = text.trim();
  if (!trimmed) return { words: 0, chars: 0, sentences: 0, readingTime: '0 min' };

  const words = trimmed.split(/\s+/).length;
  const chars = trimmed.length;
  const sentences = (trimmed.match(/[.!?]+/g) || []).length || (words > 0 ? 1 : 0);
  const minutes = Math.ceil(words / 200);
  const readingTime = minutes < 1 ? '< 1 min' : `${minutes} min`;

  return { words, chars, sentences, readingTime };
}

/**
 * Promptfoo assertion for the save-recall eval (promptfoo-memory-save.yaml).
 *
 * Each save-worthy moment names marker words that only a memory about that
 * moment would contain (a tool name, a flag, a port). A moment is saved when
 * one memory body holds all of its markers. A memory that matches no moment is
 * a noise save.
 *
 *   - type: javascript
 *     value: file://./assertions/memorySave.ts
 *     config:
 *       moments:
 *         - name: correction
 *           markers: [pnpm]
 */

interface Moment {
  name: string;
  markers: string[];
}

interface SavedEntry {
  id: string;
  body: string;
  terms?: string[];
}

interface PromptfooContext {
  config?: { moments?: Moment[] };
  test?: { options?: { config?: { moments?: Moment[] } } };
  providerResponse?: { metadata?: { saved?: SavedEntry[]; commands?: string[] } };
}

function matches(entry: SavedEntry, moment: Moment): boolean {
  const text = `${entry.body}\n${(entry.terms ?? []).join(' ')}`.toLowerCase();
  return moment.markers.every((marker) => text.includes(marker.toLowerCase()));
}

export default function memorySave(_output: string, context: PromptfooContext) {
  const moments = context.config?.moments ?? context.test?.options?.config?.moments ?? [];
  const saved = context.providerResponse?.metadata?.saved ?? [];

  const savedMoments = moments.filter((moment) => saved.some((entry) => matches(entry, moment)));
  const missedMoments = moments.filter((moment) => !savedMoments.includes(moment));
  const noise = saved.filter((entry) => !moments.some((moment) => matches(entry, moment)));

  const total = moments.length + noise.length;
  const lines = [
    `saved: ${savedMoments.map((m) => m.name).join(', ') || 'none'}`,
    `missed: ${missedMoments.map((m) => m.name).join(', ') || 'none'}`,
    `noise saves: ${noise.map((entry) => `${entry.id} ("${entry.body.split('\n')[0]}")`).join('; ') || 'none'}`,
  ];
  return {
    pass: missedMoments.length === 0 && noise.length === 0,
    score: total === 0 ? 1 : savedMoments.length / total,
    reason: lines.join(' | '),
  };
}

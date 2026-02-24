/**
 * Idea parsing and prompt-building utilities for SlopZilla.
 *
 * Extracted from SlopZilla.tsx to keep each file focused and under 500 LOC.
 */

import type { AppIdea, Complexity, SlopZillaState } from '../shared/types';

// ── Score helpers ──────────────────────────────────────────

export function clampScore(n: number): number {
  return Math.max(1, Math.min(10, Math.round(n)));
}

// ── Parse AI response into ideas ───────────────────────────

export function parseIdeasResponse(response: string): AppIdea[] {
  try {
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((item: Record<string, unknown>, i: number) => ({
          id: i + 1,
          name: String(item.name || `App ${i + 1}`),
          tagline: String(item.tagline || ''),
          description: String(item.description || ''),
          techStack: Array.isArray(item.techStack)
            ? item.techStack.map(String)
            : [],
          slopScore: clampScore(Number(item.slopScore) || 5),
        }));
      }
    }
  } catch {
    // Fall through to manual parsing
  }

  return parseFallback(response);
}

function parseFallback(text: string): AppIdea[] {
  const ideas: AppIdea[] = [];
  const blocks = text.split(/\n(?=\d+[\.\)]\s)/);

  for (const block of blocks) {
    const nameMatch = block.match(
      /\*\*(.+?)\*\*|"(.+?)"|(?:Name:\s*)(.+?)(?:\n|$)/i,
    );
    const name = nameMatch?.[1] || nameMatch?.[2] || nameMatch?.[3];
    if (!name) continue;

    const taglineMatch = block.match(
      /(?:Tagline|Subtitle):\s*(.+?)(?:\n|$)/i,
    );
    const descMatch = block.match(
      /(?:Description|About):\s*(.+?)(?:\n\n|\n(?=[A-Z]))/is,
    );
    const slopMatch = block.match(/(?:Slop|Score):\s*(\d+)/i);

    ideas.push({
      id: ideas.length + 1,
      name: name.trim(),
      tagline: taglineMatch?.[1]?.trim() || 'Pure, unfiltered slop',
      description: descMatch?.[1]?.trim() || block.slice(0, 200).trim(),
      techStack: extractTech(block),
      slopScore: clampScore(Number(slopMatch?.[1]) || 5),
    });
  }

  return ideas.slice(0, 3);
}

function extractTech(text: string): string[] {
  const known = [
    'React', 'Vue', 'Svelte', 'Three.js', 'Canvas', 'WebSocket',
    'SQLite', 'Node.js', 'Python', 'Rust', 'Go', 'WebAssembly',
    'Tailwind', 'GraphQL', 'WebGL', 'Web Audio', 'TypeScript',
    'Next.js', 'Express', 'FastAPI', 'D3.js', 'CSS',
  ];
  return known.filter((t) => text.toLowerCase().includes(t.toLowerCase()));
}

// ── Pad ideas to exactly 3 ────────────────────────────────

export function padIdeas(ideas: AppIdea[]): AppIdea[] {
  const final = ideas.slice(0, 3);
  while (final.length < 3) {
    final.push({
      id: final.length + 1,
      name: `Mystery Slop ${final.length + 1}`,
      tagline: 'So mysterious even SlopZilla is confused',
      description:
        'This idea is so avant-garde it defies description. Build it and find out what happens.',
      techStack: ['React', 'TypeScript', 'Vibes'],
      slopScore: 7,
    });
  }
  return final;
}

// ── AI prompt builder ──────────────────────────────────────

const COMPLEXITY_DESC: Record<Complexity, string> = {
  low: 'Simple apps — something achievable in under an hour. Single page, minimal features, fun and quick.',
  medium: 'Medium complexity — a few features, decent UI, some state management. A solid afternoon project.',
  high: 'Complex and ambitious — multi-page, external APIs, real architecture. A weekend project at minimum.',
};

export function buildIdeaPrompt(
  complexity: Complexity,
  technologies: string[],
  history: SlopZillaState['history'],
): string {
  const techClause =
    technologies.length > 0
      ? `\n\nThe user wants these technologies used: ${technologies.join(', ')}. Incorporate them creatively into the ideas.`
      : '\n\nPick interesting and appropriate technologies for each idea.';

  const historyClause =
    history.length > 0
      ? `\n\nIMPORTANT — The user has already built these apps previously. Do NOT generate ideas that are the same or very similar to any of these:\n${history.map((h) => `- "${h.idea.name}": ${h.idea.tagline}`).join('\n')}\n\nCome up with completely different, fresh ideas.`
      : '';

  return `You are SlopZilla, a kaiju-sized AI idea generator. Generate exactly 3 creative, fun, and slightly absurd app ideas. These should be real buildable apps, but with a humorous twist. Think weird mashups, unexpected use cases, or absurdly specific tools.

Complexity level: ${complexity.toUpperCase()}
${COMPLEXITY_DESC[complexity]}${techClause}${historyClause}

Respond with a JSON array of exactly 3 objects. Each object must have these fields:
- "name": string (catchy app name, 1-3 words)
- "tagline": string (funny one-liner, max 10 words)
- "description": string (2-3 sentences explaining what it does and why it's gloriously absurd)
- "techStack": string[] (3-5 technologies to build it with)
- "slopScore": number (1-10, how absurdly "sloppy" this idea is — higher = more unhinged)

Make each idea distinct. One should be relatively practical (slopScore 2-4), one should be moderately weird (slopScore 5-7), and one should be peak absurdity (slopScore 8-10).

Respond ONLY with the JSON array, no other text.`;
}

// ── Build prompt for launching ─────────────────────────────

const BUILD_COMPLEXITY_DESC: Record<Complexity, string> = {
  low: 'Keep it simple — a single-page app with minimal features. Focus on getting something working fast.',
  medium: 'Build a solid app with multiple features, proper state management, and decent UX. Make it functional and polished.',
  high: 'Go all out — complex architecture, multiple views/pages, external APIs if needed, thorough error handling, and polished UI. Make it impressive.',
};

export function buildLaunchPrompt(
  idea: AppIdea,
  complexity: Complexity,
): string {
  return `# SlopZilla Build Request

You are building an app that was generated by SlopZilla, the kaiju-sized AI slop idea generator. Build this with enthusiasm!

## App Concept
**Name:** ${idea.name}
**Tagline:** ${idea.tagline}
**Description:** ${idea.description}
**Slop Score:** ${idea.slopScore}/10

## Tech Stack
${idea.techStack.map((t) => `- ${t}`).join('\n')}

## Complexity Level: ${complexity.toUpperCase()}
${BUILD_COMPLEXITY_DESC[complexity]}

## Instructions
1. Set up the project with the specified tech stack
2. Build out the core functionality described above
3. Add a fun, polished UI that matches the spirit of the app
4. Include a README.md explaining what it does and how to run it
5. Make it actually work — this should be a real, functional app

Don't use a subfolder for the app - put all the code in the root of the workspace.

Have fun with it! This is SlopZilla-generated slop, so embrace the chaos and make something delightfully weird.`;
}

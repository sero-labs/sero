/**
 * Content generation utilities for Count Slopula.
 *
 * Prompt building, response parsing, and all the dark arts
 * of summoning the most cliched content known to humankind.
 */

import type { ContentPiece, Intensity, CountSlopulaState } from '../shared/types';

// ── Score helpers ──────────────────────────────────────────

export function clampRating(n: number): number {
  return Math.max(1, Math.min(10, Math.round(n)));
}

// ── Parse AI response into content pieces ──────────────────

export function parsePiecesResponse(response: string): ContentPiece[] {
  try {
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((item: Record<string, unknown>, i: number) => ({
          id: i + 1,
          name: String(item.name || `Content ${i + 1}`),
          tagline: String(item.tagline || ''),
          body: String(item.body || ''),
          genre: String(item.genre || 'Unknown'),
          slopRating: clampRating(Number(item.slopRating) || 5),
        }));
      }
    }
  } catch {
    // Fall through to manual parsing
  }

  return parseFallback(response);
}

function parseFallback(text: string): ContentPiece[] {
  const pieces: ContentPiece[] = [];
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
    const bodyMatch = block.match(
      /(?:Body|Content|Text):\s*([\s\S]+?)(?:\n\n|\n(?=[A-Z]))/i,
    );
    const slopMatch = block.match(/(?:Slop|Rating|Score):\s*(\d+)/i);
    const genreMatch = block.match(/(?:Genre|Type|Category):\s*(.+?)(?:\n|$)/i);

    pieces.push({
      id: pieces.length + 1,
      name: name.trim(),
      tagline: taglineMatch?.[1]?.trim() || 'Freshly drained from the crypt',
      body: bodyMatch?.[1]?.trim() || block.slice(0, 400).trim(),
      genre: genreMatch?.[1]?.trim() || 'Unknown',
      slopRating: clampRating(Number(slopMatch?.[1]) || 5),
    });
  }

  return pieces.slice(0, 3);
}

// ── Pad pieces to exactly 3 ────────────────────────────────

export function padPieces(pieces: ContentPiece[]): ContentPiece[] {
  const final = pieces.slice(0, 3);
  while (final.length < 3) {
    final.push({
      id: final.length + 1,
      name: `Mystery From The Crypt ${final.length + 1}`,
      tagline: 'Even Count Slopula doesn\'t know what this is',
      body: 'This content was found in a dusty coffin in the deepest reaches of the crypt. It defies categorization. It defies taste. It might defy the laws of physics. Only the bravest dare to build it into a webpage.',
      genre: 'Eldritch Mystery',
      slopRating: 7,
    });
  }
  return final;
}

// ── AI prompt builder ──────────────────────────────────────

const INTENSITY_DESC: Record<Intensity, string> = {
  nibble: 'Mild and approachable — the content should be recognizably cliched but still somewhat tasteful. Like a vampire that says "please" before biting.',
  bite: 'Moderately unhinged — lean into the tropes hard. Every cliche should be cranked to 7/10. The content should make people groan and laugh simultaneously.',
  drain: 'MAXIMUM SLOP. Drain every last drop of originality. Stack cliches on top of cliches. Mix metaphors like a blender full of buzzwords. Make it so over-the-top it loops back around to being art.',
};

export function buildContentPrompt(
  intensity: Intensity,
  genres: string[],
  history: CountSlopulaState['history'],
): string {
  const genreClause =
    genres.length > 0
      ? `\n\nThe user wants content in these genres: ${genres.join(', ')}. Generate one piece for each selected genre (up to 3). If fewer than 3 genres selected, fill the remaining slots with your most inspired cliche-ridden genres.`
      : '\n\nPick 3 different genres from this list and generate one piece for each: Motivational Drivel, Clickbait From The Crypt, LinkedIn Nightmares, Cursed Recipes, Conspiracy Corner, Horoscope Horror, Startup Seance, Dating Doom, Movie Mashup Mausoleum, Pirate Shanty Generator, Corporate Buzzword Salad, Passive-Aggressive Notes.';

  const historyClause =
    history.length > 0
      ? `\n\nIMPORTANT — The user has already generated these pieces previously. Do NOT generate content that is the same or very similar:\n${history.map((h) => `- "${h.piece.name}": ${h.piece.tagline}`).join('\n')}\n\nCome up with completely different, fresh content.`
      : '';

  return `You are Count Slopula, a centuries-old vampire who feeds not on blood, but on originality. You drain all creativity from content and replace it with the most glorious, shameless, turbo-charged CLICHES, TROPES, MEMES, and STEREOTYPES ever conceived.

Your mission: Generate exactly 3 pieces of hilariously cliched content. Use the most overused tropes, the most tired memes, the most beaten-to-death stereotypes. Lean into every single cliche with zero shame. Mix references from different decades and genres. Stack puns on top of puns. Reference memes both ancient and modern. Include the most overused stock photo descriptions. Channel the energy of a 2010 motivational poster crossed with a 2024 LinkedIn influencer crossed with a medieval vampire.

Intensity level: ${intensity.toUpperCase()}
${INTENSITY_DESC[intensity]}${genreClause}${historyClause}

GENRE GUIDELINES (use these for inspiration, pick the relevant ones):
- Motivational Drivel: "Live Laugh Love" energy meets fortune cookie meets gym bro motivation meets corporate wellness poster. Reference sunsets, mountains, eagles, and "the grind."
- Clickbait From The Crypt: "You Won't BELIEVE What Happened Next" energy. Numbered lists, shocking revelations, doctors who HATE this one weird trick.
- LinkedIn Nightmares: "I was fired and it was the BEST thing that happened to me" energy. Humble brags, "agree?", inspirational CEO stories, "I don't usually post about my personal life BUT..."
- Cursed Recipes: Fusion food gone wrong. "Deconstructed" everything. Putting sriracha on things that should never have sriracha. "My grandmother's recipe (with a twist)."
- Conspiracy Corner: Flat earth meets birds aren't real meets the mattress store conspiracy. Completely unhinged but delivered with absolute sincerity.
- Horoscope Horror: Absurdly specific predictions. "Mercury is in retrograde and that's why your toast burned." Include crystals, energy, vibes, and alignment.
- Startup Seance: "It's like Uber but for..." energy. Blockchain everything. AI everything. Disrupting industries that don't need disrupting.
- Dating Doom: "I'm fluent in sarcasm" meets "looking for my partner in crime" meets "not here for hookups" meets "I probably swiped right for your dog."
- Movie Mashup Mausoleum: Combine 2-3 movie genres that should never be combined. Include all the tropes from each.
- Pirate Shanty Generator: Sea shanties about modern problems. "Yo ho ho and a bottle of oat milk." Corporate pirate life.
- Corporate Buzzword Salad: "Synergize cross-functional deliverables to leverage our core competencies and move the needle on stakeholder alignment."
- Passive-Aggressive Notes: Office kitchen notes, roommate notes, neighbor notes. "To WHOEVER keeps stealing my clearly labeled yogurt..."

Respond with a JSON array of exactly 3 objects. Each object must have these fields:
- "name": string (catchy title for this content piece, 2-5 words)
- "tagline": string (punny one-liner subtitle, max 12 words)
- "body": string (the actual content — 3-6 sentences of PURE CONCENTRATED SLOP. Make it detailed, funny, and packed with cliches)
- "genre": string (which genre this falls under)
- "slopRating": number (1-10, how absurdly cliched this is — higher = more concentrated slop)

Make each piece distinct. One should be mildly cliched (slopRating 2-4), one should be solidly tropey (slopRating 5-7), and one should be WEAPONS-GRADE SLOP (slopRating 8-10).

Respond ONLY with the JSON array, no other text.`;
}

// ── Build prompt for launching as a web page ────────────────

const BUILD_INTENSITY_DESC: Record<Intensity, string> = {
  nibble: 'Keep it simple and clean — a single polished page that presents the content with mild vampire theming.',
  bite: 'Build a proper page with personality — gothic styling, dramatic animations, and some interactive elements. Make it fun to share.',
  drain: 'GO ABSOLUTELY WILD. Maximum theatrics. Animations everywhere. Sound effects if possible. Easter eggs. The page should be an experience, not just content. Think "what if a vampire designed a GeoCities page in 2024."',
};

export function buildLaunchPrompt(
  piece: ContentPiece,
  intensity: Intensity,
): string {
  return `# Count Slopula Build Request

You are building a web page for content generated by Count Slopula, the vampire-themed cliche content generator. Build this with dramatic flair!

## Content
**Title:** ${piece.name}
**Tagline:** ${piece.tagline}
**Genre:** ${piece.genre}
**Content:** ${piece.body}
**Slop Rating:** ${piece.slopRating}/10

## Intensity Level: ${intensity.toUpperCase()}
${BUILD_INTENSITY_DESC[intensity]}

## Instructions
1. Create a single-page web app that showcases this content beautifully
2. Use a gothic/vampire theme — dark backgrounds, deep reds and purples, dramatic typography
3. Use Google Fonts "Creepster" for headings and "Crimson Text" for body text
4. Add atmospheric effects — fog, blood drips, bat silhouettes, candlelight flickers
5. Make the page shareable — it should look amazing as a screenshot
6. Include the "Slop Rating" as a visual blood meter element
7. Add some vampire-themed commentary or framing around the content
8. Make it responsive and visually stunning
9. Include a footer crediting "Count Slopula" as the creator

Don't use a subfolder for the app - put all the code in the root of the workspace.

Embrace the darkness! This is Count Slopula's masterwork — make it gloriously gothic and delightfully cliched.`;
}

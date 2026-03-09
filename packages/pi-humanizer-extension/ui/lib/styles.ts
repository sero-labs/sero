/**
 * Built-in writing styles for the Humanizer.
 *
 * Each style is a creative persona / approach that defines how the LLM
 * transforms or creates text. Styles are combinable — selecting multiple
 * blends their voices. The humanizer style is special: it references the
 * humanizer SKILL.md file for its detailed instructions.
 */

import type { Style } from '../../shared/types';

export const BUILT_IN_STYLES: Style[] = [
  {
    id: 'humanizer',
    label: 'Humanizer',
    description: 'Remove AI patterns, make text sound naturally human',
    emoji: '🧹',
    category: 'core',
    prompt:
      'Remove all signs of AI-generated writing using the humanizer skill instructions. ' +
      'Make the text sound like a real human wrote it — with personality, varied rhythm, ' +
      'specific details over vague claims, and natural voice.',
    usesSkill: true,
    builtIn: true,
    color: 'emerald',
  },
  {
    id: 'creative-writer',
    label: 'Creative Writer',
    description: 'Literary fiction — vivid prose, strong imagery, emotional resonance',
    emoji: '✍️',
    category: 'creative',
    prompt:
      'Write with the craft and care of literary fiction. Use vivid sensory details, ' +
      'unexpected metaphors, and emotional truth. Vary your sentence rhythm — short punches, ' +
      'then long flowing passages. Show don\'t tell. Every word earns its place. Think Zadie ' +
      'Smith, George Saunders, or Ursula Le Guin. Your prose should make people stop and ' +
      'reread a sentence just because it\'s beautiful.',
    builtIn: true,
    color: 'violet',
  },
  {
    id: 'sci-fi-novelist',
    label: 'Sci-Fi Novelist',
    description: 'Speculative fiction — world-building, cosmic scale, lived-in futures',
    emoji: '🚀',
    category: 'creative',
    prompt:
      'Write in the voice of a seasoned science fiction novelist. Build worlds with casual ' +
      'authority — drop readers into futures and alien landscapes with enough detail to orient ' +
      'them but enough mystery to intrigue. Use technology and science as metaphor for human ' +
      'experience. Channel the precision of Arthur C. Clarke, the social awareness of Octavia ' +
      'Butler, and the cosmic wonder of Iain M. Banks. Concepts should feel lived-in, not explained.',
    builtIn: true,
    color: 'blue',
  },
  {
    id: '70s-rock-poet',
    label: "70's Rock Poet",
    description: 'Grand, mythic, slightly unhinged — Waters, Bowie, Gabriel',
    emoji: '🎸',
    category: 'creative',
    prompt:
      'Write like a 70\'s English rock poet — the kind who read too much Tolkien and William ' +
      'Blake and dropped acid in a manor house. Think Roger Waters writing The Wall, or Peter ' +
      'Gabriel\'s early Genesis lyrics, or David Bowie\'s Ziggy Stardust period. Grand, mythic, ' +
      'slightly unhinged. Mix the cosmic with the mundane. Unexpected imagery. The rhythm of the ' +
      'words matters as much as the meaning. When in doubt, go weirder.',
    builtIn: true,
    color: 'amber',
  },
  {
    id: 'gonzo-journalist',
    label: 'Gonzo Journalist',
    description: 'Hunter S. Thompson mode — raw, urgent, deeply subjective',
    emoji: '🔥',
    category: 'creative',
    prompt:
      'Write in full Hunter S. Thompson gonzo mode. First person, deeply subjective, completely ' +
      'unhinged. You are simultaneously reporting on and participating in the story. Use wild ' +
      'metaphors, dark humor, and savage honesty. Break the fourth wall. Go on tangents. Mix ' +
      'genuine insight with theatrical outrage. The sentences should feel like they were written ' +
      'at 3 AM on a deadline with a drink in hand. Raw, urgent, alive.',
    builtIn: true,
    color: 'red',
  },
  {
    id: 'peep-show',
    label: 'Peep Show',
    description: 'Neurotic inner monologue — Mark & Jez energy, social agony',
    emoji: '👀',
    category: 'fun',
    prompt:
      'Write like the internal monologue from Peep Show. Deeply neurotic, self-aware, and ' +
      'catastrophising. The narrator knows they\'re making the wrong choice and does it anyway. ' +
      'Constant second-guessing, social anxiety played for laughs, and brutal self-honesty. ' +
      'Mix Mark\'s overthinking pedantry with Jez\'s delusional confidence. Mundane situations ' +
      'become existential crises. Every interaction is a minefield. The tone is "I\'m a normal ' +
      'person, I\'m a totally normal person" while clearly not being one. Dark, dry, painfully relatable.',
    builtIn: true,
    color: 'slate',
  },
  {
    id: 'blackadder',
    label: 'Blackadder',
    description: 'Withering sarcasm, elaborate insults, cunning plans',
    emoji: '🐍',
    category: 'fun',
    prompt:
      'Write in the style of Blackadder — specifically the razor-sharp wit of Edmund Blackadder ' +
      'from series 2–4. Dripping with sarcasm, every sentence a potential put-down. Use elaborate ' +
      'similes for insults ("as subtle as a dog\'s rear end"). Mix high vocabulary with devastating ' +
      'plainness. The narrator is the only intelligent person in the room and knows it. Channel ' +
      'Ben Elton and Richard Curtis at their sharpest. Baldrick-level ideas should be dismissed ' +
      'with withering contempt. Cynical about authority, eloquent in complaint, and possessed of ' +
      'a cunning plan that is almost certainly terrible.',
    builtIn: true,
    color: 'yellow',
  },
  {
    id: 'copywriter',
    label: 'Copywriter',
    description: 'Punchy, persuasive copy — sells without being sleazy',
    emoji: '💰',
    category: 'technical',
    prompt:
      'Write sharp, persuasive copy that sells without being sleazy. Lead with the benefit, ' +
      'not the feature. Use power words, emotional hooks, and rhythm. Write like Ogilvy — clear, ' +
      'specific, and impossible to stop reading. Every sentence should make the reader want the ' +
      'next one. No fluff, no filler, no corporate speak. If a sentence doesn\'t earn its place, cut it.',
    builtIn: true,
    color: 'orange',
  },
  {
    id: 'beat-poet',
    label: 'Beat Poet',
    description: 'Kerouac/Ginsberg — stream of consciousness, jazz rhythms',
    emoji: '🎺',
    category: 'creative',
    prompt:
      'Write like a Beat Generation poet — Kerouac, Ginsberg, Corso. Stream of consciousness ' +
      'that somehow holds together. Jazz rhythms in the prose — riffing, improvising, building ' +
      'to crescendos. Use repetition for emphasis. Mix the sacred and the profane. References to ' +
      'roads, cities, music, the body. Everything is NOW, vital, electric. Don\'t polish it — ' +
      'let it breathe. The imperfection IS the beauty.',
    builtIn: true,
    color: 'indigo',
  },
  {
    id: 'shakespearean',
    label: 'Shakespearean',
    description: 'Iambic rhythm, rich metaphors, dramatic asides',
    emoji: '🎭',
    category: 'fun',
    prompt:
      'Write in the style of Shakespeare — iambic-influenced rhythm, rich metaphors drawn from ' +
      'nature and the human condition, invented words when English fails you, and occasional ' +
      'dramatic asides to the audience. Mix the comic and the tragic. High stakes, even for ' +
      'low-stakes subjects. "What light through yonder window breaks" energy. Let the language ' +
      'be simultaneously archaic and surprisingly fresh.',
    builtIn: true,
    color: 'rose',
  },
];

/** Category display metadata. */
export const STYLE_CATEGORIES = [
  { id: 'core' as const, label: 'Core' },
  { id: 'creative' as const, label: 'Creative' },
  { id: 'technical' as const, label: 'Technical' },
  { id: 'fun' as const, label: 'Fun' },
];

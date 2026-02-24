/**
 * GeneratingPhase — animated loading screen while the AI generates ideas.
 *
 * Shows a stomping Godzilla, fire breath beam, and dramatic text.
 */

import { useState, useEffect } from 'react';

const KAIJU_ART = `      /\\/\\/\\
     /  @    \\___
    /    __   __/
   |____/  \\_/
     |    |
    _|  _ |_
   |__|| |__|`;

const FLAVORS = [
  'Consulting the ancient scrolls of Stack Overflow...',
  'Feeding the AI extra radioactive slop...',
  'Crushing boring ideas underfoot...',
  'Channeling pure chaotic energy...',
  'Rampaging through the idea district...',
  'Absorbing cosmic radiation for inspiration...',
  'Demolishing the competition...',
  'Charging atomic breath beam...',
];

function FlavorText() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setIndex((i) => (i + 1) % FLAVORS.length);
    }, 2500);
    return () => clearInterval(timer);
  }, []);

  return (
    <p
      className="mt-8 text-xs italic text-center"
      style={{ color: 'var(--sz-text-dim)', opacity: 0.7 }}
    >
      {FLAVORS[index]}
    </p>
  );
}

export function GeneratingPhase() {
  return (
    <div className="sz-animate-fade-up flex flex-col items-center justify-center flex-1 px-6 py-12 relative z-10">
      {/* Stomping Godzilla */}
      <div className="sz-animate-stomp mb-8">
        <pre
          className="text-sm leading-tight font-mono select-none text-center"
          style={{
            color: 'var(--sz-neon)',
            filter: 'drop-shadow(0 0 12px var(--sz-neon-glow-strong))',
          }}
          aria-hidden="true"
        >
          {KAIJU_ART}
        </pre>
      </div>

      {/* Fire breath */}
      <div className="w-48 mb-8">
        <div className="sz-fire-beam" />
      </div>

      {/* Loading text */}
      <h2
        className="sz-kaiju-text text-xl mb-4 text-center sz-animate-breathe"
        style={{ color: 'var(--sz-neon)' }}
      >
        GENERATING SLOP...
      </h2>

      <p className="text-sm text-center mb-6" style={{ color: 'var(--sz-text-dim)' }}>
        SlopZilla is stomping through the idea factory
      </p>

      {/* Loading dots */}
      <div className="flex gap-3">
        <div className="sz-loading-dot" />
        <div className="sz-loading-dot" />
        <div className="sz-loading-dot" />
      </div>

      <FlavorText />
    </div>
  );
}

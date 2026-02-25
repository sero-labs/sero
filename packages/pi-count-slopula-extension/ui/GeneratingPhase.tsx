/**
 * GeneratingPhase — animated loading screen while the AI generates content.
 *
 * Shows a floating bat, blood drip animation, and dramatic flavor text.
 */

import { useState, useEffect } from 'react';

const BAT_ART = `   _       _
  /_\\     /_\\
 //  \\_V_/  \\\\
 \\\\   o o   //
  \\\\  ^^^  //
   '-------'`;

const FLAVORS = [
  'Raiding the cliche vaults...',
  'Draining originality from innocent content...',
  'Consulting the ancient scrolls of BuzzFeed...',
  'Counting tropes... one, two, three, ah ah ah...',
  'Resurrecting dead memes from their graves...',
  'Mixing metaphors in a cauldron of cringe...',
  'Polishing the most overused phrases...',
  'Summoning the spirit of every LinkedIn influencer...',
  'Harvesting inspirational quotes from cursed posters...',
  'Distilling pure, weapons-grade cliche...',
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
      style={{ color: 'var(--cs-text-dim)', opacity: 0.7 }}
    >
      {FLAVORS[index]}
    </p>
  );
}

export function GeneratingPhase() {
  return (
    <div className="cs-animate-fade-up flex flex-col items-center justify-center flex-1 px-6 py-12 relative z-10">
      {/* Floating bat */}
      <div className="cs-animate-bat mb-8">
        <pre
          className="text-sm leading-tight font-mono select-none text-center"
          style={{
            color: 'var(--cs-crimson)',
            filter: 'drop-shadow(0 0 12px var(--cs-crimson-glow-strong))',
          }}
          aria-hidden="true"
        >
          {BAT_ART}
        </pre>
      </div>

      {/* Blood drip animation */}
      <div className="flex gap-4 mb-8">
        <div
          className="w-1 h-8 rounded-full"
          style={{
            background: 'linear-gradient(180deg, var(--cs-crimson), transparent)',
            animation: 'cs-blood-drip 2s ease-in infinite',
          }}
        />
        <div
          className="w-1 h-8 rounded-full"
          style={{
            background: 'linear-gradient(180deg, var(--cs-crimson), transparent)',
            animation: 'cs-blood-drip 2s ease-in infinite 0.5s',
          }}
        />
        <div
          className="w-1 h-8 rounded-full"
          style={{
            background: 'linear-gradient(180deg, var(--cs-crimson), transparent)',
            animation: 'cs-blood-drip 2s ease-in infinite 1s',
          }}
        />
      </div>

      {/* Loading text */}
      <h2
        className="cs-vampire-text text-xl mb-4 text-center cs-animate-heartbeat"
        style={{ color: 'var(--cs-crimson)' }}
      >
        DRAINING ORIGINALITY...
      </h2>

      <p className="text-sm text-center mb-6 italic" style={{ color: 'var(--cs-text-dim)' }}>
        The Count is rummaging through the crypt of cliches
      </p>

      {/* Loading drops */}
      <div className="flex gap-3">
        <div className="cs-loading-drop" />
        <div className="cs-loading-drop" />
        <div className="cs-loading-drop" />
      </div>

      <FlavorText />
    </div>
  );
}

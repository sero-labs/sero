// Simulated observations for the review. Nothing here comes from a real run.
(() => {
  const owner = (what, extra = {}) => ({ who: 'Architect', what, quiet: true, ...extra });

  const roomLive = {
    title: 'Room · Build the synth',
    link: 'Open Room',
    rows: [
      { who: 'Implementer', what: 'edit src/keys.js', t: 4, text: 'The key map is in one table now. I am adding the key-up handler, so a note stops when the key is released and a held key does not start the note again.' },
      { who: 'scout', child: true, what: 'read src/audio/voice.js', t: 12, text: 'The voice has one oscillator and one gain node. The envelope is applied on the gain node.' },
      { who: 'Tester', what: 'bash npx playwright test keys.spec.js', t: 21, text: 'Seven of eight keys pass. The K key does not play the top note. I am sending the result to the Implementer.' },
    ],
  };
  const workflowQuiet = {
    title: 'Workflow · Check sound and controls',
    link: 'Open Workflow',
    rows: [{ who: 'Step 2 · Check the waveform switch', what: 'waiting for the model', quiet: true, t: 47, text: '' }],
  };
  const working = [{ rows: [owner('waiting for the Room and the Workflow')] }, roomLive, workflowQuiet];

  const plan = [
    { glyph: 'check', tone: 'live', title: 'Playable keyboard', state: 'Accepted' },
    { glyph: 'play', tone: 'live', title: 'Sound controls', state: 'Working', link: 'Open Room' },
    { glyph: 'dash', title: 'Visualizer', state: 'Not started' },
  ];
  const checks = [
    { ok: true, name: 'Keys A to K play one octave' },
    { ok: true, name: 'Waveform switch changes the sound' },
    { ok: true, name: 'Attack and release change the envelope' },
    { ok: true, name: 'Volume changes the output level' },
    { ok: true, name: 'Visualizer moves while a note plays' },
  ];

  const base = {
    goal: 'A small browser synth you can play with the keyboard.',
    limits: 'No frameworks. It must work offline.',
    spent: 1.32, cap: 5, preview: true, plan, checks: checks.slice(0, 1), workers: working,
  };

  window.PROTO = {
    scenarios: {
      working: { ...base, label: 'Working', glyph: 'play', tone: 'live', word: 'Working', work: 'Checking keyboard input', who: 'Build the synth · 2 members working · Last activity 8s ago', next: 'Next: check sound and controls' },
      quiet: {
        ...base, label: 'Quiet request', glyph: 'play', tone: 'live', word: 'Working', work: 'Waiting for the model', tick: 72,
        who: 'Architect · Last activity 2 min ago', next: 'Next: a first playable keyboard', spent: 0.08, preview: false, plan: [], checks: [],
        workers: [{ rows: [owner('waiting for the model', { t: 72, text: '' })] }],
      },
      lastKnown: {
        ...base, label: 'Last known', glyph: 'history', tone: 'stale', word: 'Last known', work: 'Checking keyboard input',
        who: 'Last activity 14:02 · Live work cannot be confirmed in this session', next: 'Next: check sound and controls',
        workers: [{ lost: true, rows: [
          { who: 'Implementer', what: 'Last seen 14:02 · edit src/keys.js', quiet: true },
          { who: 'Tester', what: 'Last seen 14:01 · bash npx playwright test keys.spec.js', quiet: true },
        ] }],
      },
      decision: {
        ...base, label: 'Decision', glyph: 'question', tone: 'attention', word: 'Needs you', work: 'One question', needs: 'Answer one question',
        who: 'Build the synth continues with the sound engine · Last activity 8s ago', next: 'Waiting for your answer: the on-screen keys',
        decision: {
          question: 'Must the synth also play with on-screen keys?',
          why: 'You asked for keyboard play. On-screen keys change what the page looks like.',
          recommended: 'no',
          options: [
            { id: 'no', label: 'Keyboard only', effect: 'The page stays as you asked. No more cost.' },
            { id: 'yes', label: 'Add on-screen keys', effect: 'The synth also works on a phone. About $0.40 more, in the $5.00 cap.' },
          ],
        },
      },
      saved3: {
        ...base, label: 'Saved decision', goal: 'A reading log with shelves and a yearly goal.', limits: 'This project uses the charter flow. The charter flow is deprecated.', glyph: 'question', tone: 'attention', word: 'Needs you', work: 'One question', needs: 'Answer one question',
        who: 'Architect waits for your answer · Last activity 3 min ago', next: 'Waiting for your answer: the research',
        spent: 0.42, preview: false, plan: [], checks: [], workers: [{ rows: [owner('waiting for your answer')] }],
        decision: {
          question: 'Can research agents run commands in this workspace?',
          why: 'The research planner cannot answer its question without running npm.',
          recommended: 'allow',
          options: [
            { id: 'allow', label: 'Allow commands', effect: 'Research agents can run commands in this workspace.' },
            { id: 'note', label: 'Answer in a note', effect: 'Research continues with your answer and no commands.' },
            { id: 'withdraw', label: 'Withdraw the question', effect: 'Research continues without this answer.' },
          ],
        },
      },
      pausing: {
        ...base, label: 'Pause', glyph: 'pause', tone: 'neutral', word: 'Paused by you', work: '2 turns are still finishing',
        who: 'No new work starts · Last activity 3s ago', next: 'Next: check sound and controls', action: { label: 'Resume', run: 'resume' },
        workers: [
          { title: 'Room · Build the synth', link: 'Open Room', rows: [
            { who: 'Implementer', what: 'finishing its turn · edit src/keys.js', t: 9, text: roomLive.rows[0].text },
            { who: 'Tester', what: 'finishing its turn · bash npx playwright test keys.spec.js', t: 26, text: roomLive.rows[2].text },
          ] },
          { title: 'Workflow · Check sound and controls', link: 'Open Workflow', rows: [{ who: 'Step 3 · Check attack and release', what: 'not started, paused with the project', quiet: true }] },
        ],
      },
      timeLimit: {
        ...base, label: 'Time limit', glyph: 'alert', tone: 'danger', word: 'Stopped', work: 'Build the synth reached its 30 min time limit', needs: 'Add time to continue',
        who: 'Saved work is kept · Last activity 6 min ago', next: 'Next: check sound and controls', action: { label: 'Add time…', run: 'time' },
        workers: [{ title: 'Room · Build the synth', link: 'Open Room', rows: [
          { who: 'Implementer', what: 'stopped at the time limit', quiet: true },
          { who: 'Tester', what: 'stopped at the time limit', quiet: true },
        ] }],
      },
      delivered: {
        ...base, label: 'Delivered', glyph: 'check', tone: 'live', word: 'Delivered', work: 'Open index.html or the preview. Keys A to K play one octave.',
        who: 'Checked: keys, waveform, attack and release, volume, visualizer', next: 'Limit: in Safari, click the page one time before sound starts.',
        spent: 2.87, evidenceLink: true, checks, workers: [],
        plan: plan.map((item) => ({ ...item, glyph: 'check', tone: 'live', state: 'Accepted', link: undefined })),
      },
      unapproved: {
        ...base, label: 'Not approved', glyph: 'dash', tone: 'neutral', word: 'Not started', work: 'Access is not approved', needs: 'Approve access to start',
        who: 'No paid work has started', next: '', spent: 0, preview: false, plan: [], checks: [], workers: [], action: { label: 'Review access', run: 'access' },
      },
      legacy: {
        label: null, goal: 'A reading log with shelves and a yearly goal.', limits: 'This project uses the charter flow. The charter flow is deprecated.',
        glyph: 'question', tone: 'attention', word: 'Needs you', work: 'Approve the charter', needs: 'Approve the charter',
        who: 'Architect waits for your approval · Last activity yesterday', next: '', spent: 0.42, cap: 5, preview: false, plan: [], checks: [], workers: [],
        charter: true,
      },
    },
    access: [
      ['Builders', 'Read and edit files, run commands'],
      ['Researchers', 'Read files, run commands, search the web'],
      ['Checkers', 'Read files, run commands, open the preview'],
      ['Agents', 'At most 4 at the same time, 12 in total'],
      ['Models', 'Your Architect model defaults'],
    ],
    workspaces: [
      { id: 'pocket', name: 'pocket-tools', path: '~/Projects/pocket-tools' },
      { id: 'notes', name: 'field-notes', path: '~/Projects/field-notes' },
      { id: 'reading', name: 'reading-log', path: '~/Projects/reading-log', taken: true },
    ],
  };
})();

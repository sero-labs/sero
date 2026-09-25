/* Sample data for the MCP 2026-07-28 prototype. All names are made up. */
window.MCP_DATA = {
  servers: [
    {
      name: 'sales', transport: 'HTTP', lifecycle: 'eager', auth: 'oauth', status: 'connected',
      revision: '2026-07-28', era: 'modern', extensions: ['MCP Apps', 'Tasks'],
      cache: 'Fresh. The server allows 5 min. Sero lists again in 4 min.', transportLabel: 'Streamable HTTP',
    },
    {
      name: 'crm', transport: 'STDIO', lifecycle: 'lazy', auth: 'none', status: 'connected',
      revision: '2025-06-18', era: 'legacy', extensions: [],
      cache: 'Kept until the server reports a change.', transportLabel: 'stdio',
    },
    {
      name: 'docs', transport: 'HTTP', lifecycle: 'eager', auth: 'none', status: 'connected',
      revision: '2026-07-28', era: 'modern', extensions: ['Skills'],
      cache: 'Fresh. The server allows 10 min. Sero lists again in 7 min.', transportLabel: 'Streamable HTTP',
    },
    {
      name: 'reports', transport: 'HTTP', lifecycle: 'eager', auth: 'bearer', status: 'connected',
      revision: '2026-07-28', era: 'modern', extensions: ['Tasks'],
      cache: 'Stale. Sero lists again on the next use.', transportLabel: 'Streamable HTTP',
    },
    {
      name: 'old-analytics', transport: 'HTTP', lifecycle: 'lazy', auth: 'none', status: 'connected',
      revision: '2025-03-26', era: 'legacy', extensions: [], sse: true,
      cache: 'Kept until the server reports a change.', transportLabel: 'SSE',
    },
    {
      name: 'github', transport: 'HTTP', lifecycle: 'eager', auth: 'oauth', status: 'error',
      revision: null, era: null, extensions: [], failure: 'authorization',
      cache: 'Private entries removed after the failed sign-in.', transportLabel: 'Streamable HTTP',
    },
  ],

  tasks: [
    { id: 'tsk_7f3a', server: 'reports', tool: 'build_quarterly_report', status: 'working', age: '2 min', chat: 'Q3 report' },
    { id: 'tsk_51c0', server: 'reports', tool: 'export_ledger', status: 'completed', age: '1 h', chat: 'Closed chat',
      result: 'Ledger export is ready: ledger-2026-09.csv (12,480 rows).' },
    { id: 'tsk_0b9e', server: 'sales', tool: 'refresh_forecast', status: 'disconnected', age: '8 min', chat: 'Forecast',
      note: 'The server does not answer. Sero tries again in 30 s.' },
    { id: 'tsk_c2d4', server: 'sales', tool: 'sync_accounts', status: 'blocked', age: '3 h', chat: 'Closed chat',
      note: 'Another account started this task. Sign in to sales as that account to continue it.' },
    { id: 'tsk_9a11', server: 'reports', tool: 'archive_q2', status: 'expired', age: '2 d', chat: 'Closed chat',
      note: 'The server no longer keeps this task.' },
  ],

  skills: [
    { id: 'release-notes', server: 'docs', uri: 'skill://docs/release-notes/SKILL.md',
      description: 'Writes release notes from merged pull requests.', refreshed: '5 min ago' },
    { id: 'api-style', server: 'docs', uri: 'skill://docs/api-style/SKILL.md',
      description: 'Checks REST endpoints against the API style guide.', refreshed: '5 min ago' },
    { id: 'review', server: 'docs', uri: 'skill://docs/team/review/SKILL.md',
      description: 'Reviews a pull request with the team checklist.', refreshed: '5 min ago',
      note: 'A local skill named review also exists. The agent sees this one as docs / review.' },
  ],

  rounds: [
    [
      { id: 'company', label: 'Company', prompt: 'Which company does Ana Ruiz work for?',
        options: [
          { value: 'acme-ltd', label: 'Acme Ltd' },
          { value: 'acme-holdings', label: 'Acme Holdings' },
          { value: 'decline', label: 'Decline', description: 'Send no answers to crm. The server decides what to do next.' },
        ] },
      { id: 'consent', label: 'Email consent', prompt: 'Did Ana Ruiz agree to get email from you?',
        options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }] },
    ],
    [
      { id: 'owner', label: 'Owner', prompt: 'Acme Ltd has two sales teams. Which team owns this contact?',
        options: [
          { value: 'emea', label: 'EMEA sales' },
          { value: 'partners', label: 'Partner sales' },
          { value: 'decline', label: 'Decline', description: 'Send no answers to crm. The server decides what to do next.' },
        ] },
    ],
  ],
};

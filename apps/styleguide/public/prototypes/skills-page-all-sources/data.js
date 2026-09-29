// Sanitized sample data. scope: user | plugin | project. origin: plugin name or project id.
window.WORKSPACES = [
  { id: 'sero', name: 'Sero', current: true },
  { id: 'site', name: 'Marketing site' },
];
window.PROJECTS = { sero: 'Sero', site: 'Marketing site' };
const body = (t) => `# ${t}\n\nUse this skill when the task matches its description.\n\n1. Read the files the task names.\n2. Follow the steps in order.\n3. Report what changed in plain words.`;
window.SKILLS = [
  { name: 'pi-docs', scope: 'user', origin: 'Yours', description: 'Read the bundled Pi documentation and examples when the user asks about Pi itself.' },
  { name: 'sero-plugin', scope: 'user', origin: 'Yours', description: 'Build, review and publish a Sero plugin, with the manifest and widget rules.' },
  { name: 'commit-message', scope: 'user', origin: 'Yours', description: 'Write a Conventional Commit message from the staged changes.' },
  { name: 'release-notes', scope: 'user', origin: 'Yours', description: 'Turn merged pull requests into short release notes for users.' },
  { name: 'sql-explain', scope: 'user', origin: 'Yours', description: 'Read an EXPLAIN plan and say which step is slow and why.' },
  { name: 'memory-review', scope: 'user', origin: 'Yours', description: 'My own checklist for pruning saved memory notes.' },
  { name: 'meeting-summary', scope: 'user', origin: 'Yours', description: 'Summarize a transcript into decisions, owners and open questions.', locked: true },

  { name: 'design-critique', scope: 'plugin', origin: 'Design Library', description: 'Review a design against the library rules and list what to change.' },
  { name: 'design-tokens', scope: 'plugin', origin: 'Design Library', description: 'Extract colors, type and spacing from a reference as tokens.' },
  { name: 'goal-writing', scope: 'plugin', origin: 'Orchestrator', description: 'Write a goal with a clear objective and checks that can pass or fail.' },
  { name: 'room-planning', scope: 'plugin', origin: 'Orchestrator', description: 'Plan the team, models and tools for an Agent Room.' },
  { name: 'workflow-skill-extract', scope: 'plugin', origin: 'Orchestrator', description: 'Turn a finished workflow run into a reusable skill.' },
  { name: 'architect-brief', scope: 'plugin', origin: 'Architect', description: 'Turn an idea into a project brief with scope and non-goals.' },
  { name: 'linear-triage', scope: 'plugin', origin: 'MCP: Linear', description: 'Sort new Linear issues by area and severity.', locked: true },
  { name: 'memory-review', scope: 'plugin', origin: 'Memory', description: 'Check saved memory for stale or duplicate notes.' },

  { name: 'sero-code-review', scope: 'project', origin: 'sero', description: 'Review a pull request. Verify each finding in the source first.' },
  { name: 'sero-prototype', scope: 'project', origin: 'sero', description: 'Build a reviewable prototype that matches the current Sero UI.' },
  { name: 'sero-humanize', scope: 'project', origin: 'sero', description: 'Rewrite product copy in plain, simple English.' },
  { name: 'sero-ux-audit', scope: 'project', origin: 'sero', description: 'Audit a flow for clutter and repeated facts, with screenshots.' },
  { name: 'react-doctor', scope: 'project', origin: 'sero', description: 'Run React Doctor and fix the findings.' },
  { name: 'openspec-propose', scope: 'project', origin: 'sero', description: 'Propose a change with design and tasks in one step.' },
  { name: 'openspec-apply-change', scope: 'project', origin: 'sero', description: 'Implement the tasks of an OpenSpec change.' },
  { name: 'commit-message', scope: 'project', origin: 'sero', description: 'Write a commit message in the Sero repo style, with the ticket number.' },
  { name: 'brand-voice', scope: 'project', origin: 'site', description: 'Write site copy in the Sero voice. No hype words.' },
  { name: 'seo-audit', scope: 'project', origin: 'site', description: 'Check a page for title, headings, links and speed problems.' },
].map((s) => ({ ...s, body: body(s.name), visible: !s.locked, hidden: false }));

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'rspress/config';

const currentDir = path.dirname(fileURLToPath(import.meta.url));

const startSetup = [
  { text: 'Start Here', link: '/guide/overview' },
  { text: 'Get Sero Running', link: '/guide/getting-started' },
  { text: 'Installation / Requirements', link: '/guide/installation-requirements' },
  { text: 'Choose a Workspace Runtime', link: '/guide/choose-workspace-runtime' },
  { text: 'Profiles and Onboarding', link: '/guide/profiles-and-onboarding' },
  { text: 'Models and Providers', link: '/guide/models-and-providers' },
  { text: 'Local LLMs with LM Studio', link: '/guide/local-llms-lm-studio' },
  { text: 'Development Setup', link: '/guide/development-setup' }
];

const workspaceRuntime = [
  { text: 'Workspaces and Chat', link: '/guide/workspace-and-chat' },
  { text: 'Explorer Workspace', link: '/guide/explorer-workspace' },
  { text: 'Preview Dev Servers', link: '/guide/containers-dev-servers' },
  { text: 'Browser and Capture', link: '/guide/browser-and-capture' },
  { text: 'Checkpoints and Undo', link: '/guide/checkpoints-and-undo' },
  { text: 'Themes', link: '/guide/themes' }
];

const agentsAutomation = [
  { text: 'Agent Sessions and Context', link: '/guide/agent-sessions-and-context' },
  { text: 'Subagents and Collaboration', link: '/guide/subagents' },
  { text: 'Memory', link: '/guide/memory' },
  { text: 'Scheduler and Reminders', link: '/guide/scheduler-reminders' },
  { text: 'Orchestrator', link: '/guide/orchestrator' },
  { text: 'Running Evals', link: '/guide/running-evals' }
];

const appsIntegrations = [
  { text: 'Plugins and Apps', link: '/guide/plugins-and-apps' },
  { text: 'Plugin Catalog', link: '/plugins/catalog' },
  { text: 'Dashboard and Widgets', link: '/guide/dashboard-widgets' },
  { text: 'App Store and Favorites', link: '/guide/app-store-favorites' },
  { text: 'Settings and Admin', link: '/guide/settings-models-admin' },
  { text: 'Git', link: '/guide/git-integration' },
  { text: 'MCP', link: '/guide/mcp' },
  { text: 'Web', link: '/guide/web' },
  { text: 'Remote Control', link: '/guide/remote-control' }
];

const referenceRuntime = [
  { text: 'Support Scope', link: '/reference/support-scope' },
  { text: 'Architecture', link: '/reference/architecture' },
  { text: 'Containers and Host Mode', link: '/reference/containers-host-mode' },
  { text: 'Container Isolation', link: '/reference/container-isolation' },
  { text: 'Sero CLI', link: '/reference/sero-cli' },
  { text: 'State and Folders', link: '/reference/state-and-folders' },
  { text: 'models.json', link: '/reference/models-json' },
  { text: 'Agent Definitions', link: '/reference/agent-definitions' },
  { text: 'Orchestrator', link: '/reference/orchestrator' }
];

const referenceAuthors = [
  { text: 'Plugins', link: '/reference/plugins' },
  { text: 'App Runtime', link: '/reference/app-runtime' },
  { text: 'Dashboard Components', link: '/reference/dashboard-components' },
  { text: 'Plugin Author Quick Path', link: '/reference/plugin-author-quick-path' },
  { text: 'Plugin Quickstart', link: '/reference/plugin-quickstart' },
  { text: 'Plugin End-to-End Example', link: '/reference/plugin-end-to-end-example' }
];

const referenceQuality = [
  { text: 'Testing / Evals', link: '/reference/testing-evals' },
  { text: 'Security / Privacy', link: '/reference/security-privacy' },
  { text: 'Environment Doctor', link: '/reference/environment-doctor' },
  { text: 'Troubleshooting', link: '/reference/troubleshooting' },
  { text: 'Known Limitations', link: '/reference/known-limitations' }
];

const selectedPlugins = [
  { text: 'Plugin Catalog', link: '/plugins/catalog' },
  { text: 'Graphify', link: '/plugins/graphify' },
  { text: 'User Feedback', link: '/plugins/user-feedback' },
  { text: 'Google', link: '/plugins/google' },
  { text: 'Kanban', link: '/plugins/kanban' },
  { text: 'Notes', link: '/plugins/notes' },
  { text: 'Todo', link: '/plugins/todo' },
  { text: 'Research', link: '/plugins/research' },
  { text: 'Signal Desk', link: '/plugins/signal-desk' },
  { text: 'Plan Mode', link: '/plugins/plan-mode' },
  { text: 'Spotify (Legacy)', link: '/plugins/spotify' },
  { text: 'ImageGen', link: '/plugins/imagegen' },
  { text: 'Loom', link: '/plugins/loom' },
  { text: 'Starling Bank', link: '/plugins/starling' },
  { text: 'Weight Tracker', link: '/plugins/weight-tracker' }
];

export default defineConfig({
  globalStyles: path.resolve(currentDir, 'docs/styles.css'),
  globalUIComponents: [path.resolve(currentDir, 'src/NativeImageSize.ts')],
  root: 'docs',
  outDir: 'dist',
  base: '/',
  logo: '/assets/logo.svg',
  logoText: '',
  title: 'Sero',
  description: 'Local-first, agent-first desktop workspace for macOS, Linux, and Windows.',
  lang: 'en-US',
  themeConfig: {
    nav: [
      // Cross-link back to the marketing homepage (deployed separately at
      // sero-ai.dev). Rspress 1.47's `logo` config doesn't support a custom
      // link target, so this nav item is the canonical "go home" affordance.
      { text: '← sero-ai.dev', link: 'https://sero-ai.dev' },
      { text: 'Start Here', link: '/guide/overview' },
      { text: 'Guides', link: '/guide/' },
      { text: 'Workspace', link: '/guide/workspace-and-chat' },
      { text: 'Agents', link: '/guide/agent-sessions-and-context' },
      { text: 'Plugins', link: '/plugins/catalog' },
      { text: 'Reference', link: '/reference/' }
    ],
    socialLinks: [
      {
        icon: 'github',
        mode: 'link',
        content: 'https://github.com/sero-labs/sero'
      }
    ],
    sidebar: {
      '/guide/': [
        { text: 'Tutorials: first run', items: startSetup },
        { text: 'How-to guides: workspace tasks', items: workspaceRuntime },
        { text: 'How-to guides: agents', items: agentsAutomation },
        { text: 'How-to guides: apps', items: appsIntegrations }
      ],
      '/plugins/': [
        { text: 'Plugin Catalog', items: selectedPlugins }
      ],
      '/reference/': [
        { text: 'Facts: runtime and state', items: referenceRuntime },
        { text: 'Facts: plugin authors', items: referenceAuthors },
        { text: 'Facts: quality, safety, help', items: referenceQuality }
      ]
    }
  }
});

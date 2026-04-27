import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'rspress/config';

const currentDir = path.dirname(fileURLToPath(import.meta.url));

const guideStart = [
  { text: 'Guide Home', link: '/guide/' },
  { text: 'Overview', link: '/guide/overview' },
  { text: 'Getting Started', link: '/guide/getting-started' }
];

const guideWorkspace = [
  { text: 'Workspace and Chat', link: '/guide/workspace-and-chat' },
  { text: 'Explorer Workspace', link: '/guide/explorer-workspace' }
];

const guideCapabilities = [
  { text: 'Memory', link: '/guide/memory' },
  { text: 'Web', link: '/guide/web' },
  { text: 'Remote Control', link: '/guide/remote-control' },
  { text: 'Scheduler and Reminders', link: '/guide/scheduler-reminders' },
  { text: 'Git Integration', link: '/guide/git-integration' }
];

const guidePlugins = [
  { text: 'Plugins and Apps', link: '/guide/plugins-and-apps' },
  { text: 'App Store and Favorites', link: '/guide/app-store-favorites' }
];

const guideSetup = [
  { text: 'Installation / Requirements', link: '/guide/installation-requirements' },
  { text: 'Development Setup', link: '/guide/development-setup' }
];

const referenceFoundations = [
  { text: 'Reference Home', link: '/reference/' },
  { text: 'Architecture', link: '/reference/architecture' },
  { text: 'Support Scope', link: '/reference/support-scope' }
];

const referenceRuntime = [
  { text: 'Containers and Host Mode', link: '/reference/containers-host-mode' },
  { text: 'State and Folders', link: '/reference/state-and-folders' }
];

const referencePluginAuthors = [
  { text: 'Plugins', link: '/reference/plugins' },
  { text: 'Plugin Author Quick Path', link: '/reference/plugin-author-quick-path' },
  { text: 'Plugin Quickstart', link: '/reference/plugin-quickstart' },
  { text: 'Plugin End-to-End Example', link: '/reference/plugin-end-to-end-example' }
];

const referenceQualitySafety = [
  { text: 'Testing / Evals', link: '/reference/testing-evals' },
  { text: 'Security / Privacy', link: '/reference/security-privacy' }
];

const referenceHelp = [
  { text: 'Troubleshooting', link: '/reference/troubleshooting' },
  { text: 'Known Limitations', link: '/reference/known-limitations' }
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
  description: 'Local-first, agent-first desktop workspace for macOS.',
  lang: 'en-US',
  themeConfig: {
    nav: [
      { text: 'Overview', link: '/guide/overview' },
      { text: 'Getting Started', link: '/guide/getting-started' },
      {
        text: 'Guide',
        items: [
          { text: 'Guide Home', link: '/guide/' },
          { text: 'Workspace', link: '/guide/workspace-and-chat' },
          { text: 'Capabilities', link: '/guide/memory' },
          { text: 'Plugins and Apps', link: '/guide/plugins-and-apps' },
          { text: 'Setup', link: '/guide/installation-requirements' }
        ]
      },
      {
        text: 'Reference',
        items: [
          { text: 'Reference Home', link: '/reference/' },
          { text: 'Foundations', link: '/reference/architecture' },
          { text: 'Runtime and State', link: '/reference/containers-host-mode' },
          { text: 'Plugin Authors', link: '/reference/plugins' },
          { text: 'Quality and Safety', link: '/reference/testing-evals' },
          { text: 'Help and Limits', link: '/reference/troubleshooting' }
        ]
      }
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
        {
          text: 'Start Here',
          items: guideStart
        },
        {
          text: 'Core Workspace',
          items: guideWorkspace
        },
        {
          text: 'Built-in Capabilities',
          items: guideCapabilities
        },
        {
          text: 'Plugins and Apps',
          items: guidePlugins
        },
        {
          text: 'Setup and Development',
          items: guideSetup
        }
      ],
      '/reference/': [
        {
          text: 'Foundations',
          items: referenceFoundations
        },
        {
          text: 'Runtime and State',
          items: referenceRuntime
        },
        {
          text: 'Plugin Authors',
          items: referencePluginAuthors
        },
        {
          text: 'Quality and Safety',
          items: referenceQualitySafety
        },
        {
          text: 'Help and Limits',
          items: referenceHelp
        }
      ]
    }
  }
});

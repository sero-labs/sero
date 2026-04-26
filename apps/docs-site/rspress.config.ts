import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'rspress/config';

const currentDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  globalStyles: path.resolve(currentDir, 'docs/styles.css'),
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
        text: 'Reference',
        items: [
          { text: 'Architecture', link: '/reference/architecture' },
          { text: 'Support Scope', link: '/reference/support-scope' },
          { text: 'Plugins', link: '/reference/plugins' },
          { text: 'Plugin Quickstart', link: '/reference/plugin-quickstart' },
          { text: 'Plugin End-to-End Example', link: '/reference/plugin-end-to-end-example' },
          { text: 'Testing / Evals', link: '/reference/testing-evals' },
          { text: 'Security / Privacy', link: '/reference/security-privacy' },
          { text: 'Troubleshooting', link: '/reference/troubleshooting' },
          { text: 'Known Limitations', link: '/reference/known-limitations' }
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
          items: [
            { text: 'Overview', link: '/guide/overview' },
            { text: 'Getting Started', link: '/guide/getting-started' },
            { text: 'Workspace and Chat', link: '/guide/workspace-and-chat' },
            { text: 'Memory', link: '/guide/memory' },
            { text: 'Web Access', link: '/guide/web-access' },
            { text: 'Scheduler and Reminders', link: '/guide/scheduler-reminders' },
            { text: 'Plugins and Apps', link: '/guide/plugins-and-apps' },
            {
              text: 'Installation / Requirements',
              link: '/guide/installation-requirements'
            },
            { text: 'Development Setup', link: '/guide/development-setup' }
          ]
        }
      ],
      '/reference/': [
        {
          text: 'Concepts',
          items: [
            { text: 'Architecture', link: '/reference/architecture' },
            { text: 'Support Scope', link: '/reference/support-scope' },
            { text: 'Plugins', link: '/reference/plugins' },
            { text: 'Plugin Quickstart', link: '/reference/plugin-quickstart' },
            { text: 'Plugin End-to-End Example', link: '/reference/plugin-end-to-end-example' }
          ]
        },
        {
          text: 'Quality',
          items: [
            { text: 'Testing / Evals', link: '/reference/testing-evals' }
          ]
        },
        {
          text: 'Safety',
          items: [
            {
              text: 'Security / Privacy',
              link: '/reference/security-privacy'
            }
          ]
        },
        {
          text: 'Help',
          items: [
            { text: 'Troubleshooting', link: '/reference/troubleshooting' },
            {
              text: 'Known Limitations',
              link: '/reference/known-limitations'
            }
          ]
        }
      ]
    }
  }
});

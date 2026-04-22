import { defineConfig } from 'rspress/config';

export default defineConfig({
  root: 'docs',
  outDir: 'dist',
  base: '/',
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
        content: 'https://github.com/monobyte/sero'
      }
    ],
    sidebar: {
      '/guide/': [
        {
          text: 'Start Here',
          items: [
            { text: 'Overview', link: '/guide/overview' },
            { text: 'Getting Started', link: '/guide/getting-started' },
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
            { text: 'Plugin Quickstart', link: '/reference/plugin-quickstart' }
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

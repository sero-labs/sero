/**
 * File type icons using @remixicon/react.
 * Matches the icon set from the shadcn tree example (comp-575).
 */

import {
  RiReactjsLine,
  RiCodeSSlashLine,
  RiBracesLine,
  RiFileTextLine,
  RiImageLine,
  RiFileLine,
  RiCss3Line,
  RiHtml5Line,
  RiTerminalLine,
  RiSettings3Line,
  RiLockLine,
  RiShieldLine,
  RiMarkdownLine,
  RiNpmjsLine,
  type RemixiconComponentType,
} from '@remixicon/react';

type IconProps = {
  extension?: string;
  fileName?: string;
  className?: string;
};

/** Icon by exact filename */
const FILE_NAME_ICONS: Record<string, RemixiconComponentType> = {
  'package.json': RiNpmjsLine,
  'package-lock.json': RiLockLine,
  'pnpm-lock.yaml': RiLockLine,
  'yarn.lock': RiLockLine,
  'tsconfig.json': RiSettings3Line,
  'tsconfig.app.json': RiSettings3Line,
  'tsconfig.node.json': RiSettings3Line,
  'vite.config.ts': RiSettings3Line,
  'vite.config.js': RiSettings3Line,
  'next.config.js': RiSettings3Line,
  'next.config.mjs': RiSettings3Line,
  'next.config.ts': RiSettings3Line,
  'eslint.config.js': RiSettings3Line,
  'eslint.config.mjs': RiSettings3Line,
  '.eslintrc.js': RiSettings3Line,
  '.eslintrc.json': RiSettings3Line,
  'tailwind.config.ts': RiSettings3Line,
  'tailwind.config.js': RiSettings3Line,
  '.gitignore': RiShieldLine,
  '.env': RiShieldLine,
  '.env.local': RiShieldLine,
  '.env.production': RiShieldLine,
  'Dockerfile': RiSettings3Line,
  'docker-compose.yml': RiSettings3Line,
  'README.md': RiMarkdownLine,
  'LICENSE': RiFileTextLine,
};

/** Icon by file extension */
const EXT_ICONS: Record<string, RemixiconComponentType> = {
  tsx: RiReactjsLine,
  jsx: RiReactjsLine,
  ts: RiCodeSSlashLine,
  js: RiCodeSSlashLine,
  mjs: RiCodeSSlashLine,
  cjs: RiCodeSSlashLine,
  json: RiBracesLine,
  md: RiMarkdownLine,
  mdx: RiMarkdownLine,
  txt: RiFileTextLine,
  css: RiCss3Line,
  scss: RiCss3Line,
  less: RiCss3Line,
  html: RiHtml5Line,
  htm: RiHtml5Line,
  svg: RiImageLine,
  png: RiImageLine,
  jpg: RiImageLine,
  jpeg: RiImageLine,
  gif: RiImageLine,
  webp: RiImageLine,
  ico: RiImageLine,
  sh: RiTerminalLine,
  bash: RiTerminalLine,
  zsh: RiTerminalLine,
  yml: RiSettings3Line,
  yaml: RiSettings3Line,
  toml: RiSettings3Line,
  env: RiShieldLine,
  lock: RiLockLine,
  py: RiCodeSSlashLine,
  rs: RiCodeSSlashLine,
  go: RiCodeSSlashLine,
  rb: RiCodeSSlashLine,
  java: RiCodeSSlashLine,
  c: RiCodeSSlashLine,
  cpp: RiCodeSSlashLine,
  h: RiCodeSSlashLine,
  hpp: RiCodeSSlashLine,
};

export function FileIcon({ extension, fileName, className }: IconProps) {
  // Check exact filename first
  if (fileName && FILE_NAME_ICONS[fileName]) {
    const Icon = FILE_NAME_ICONS[fileName];
    return <Icon className={className} />;
  }

  // Check extension
  if (extension && EXT_ICONS[extension]) {
    const Icon = EXT_ICONS[extension];
    return <Icon className={className} />;
  }

  // Default
  return <RiFileLine className={className} />;
}

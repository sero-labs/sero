/**
 * Monaco editor theme catalog.
 *
 * Defines a curated list of editor color schemes available to the user.
 * Built-in themes ('vs', 'vs-dark', 'hc-light', 'hc-black') are referenced
 * by id only — Monaco ships them. Custom themes carry an `IStandaloneThemeData`
 * payload that we register on first mount via `monaco.editor.defineTheme()`.
 *
 * The 'auto' entry is a virtual theme that resolves to 'vs' or 'vs-dark'
 * depending on the app's effective light/dark mode.
 */

import type * as monacoApi from 'monaco-editor';
import type { ThemeInput } from '@streamdown/code';
import { AUTO_EDITOR_THEME_ID, resolveShikiThemePair, type ShikiThemeName } from '@sero-ai/common';

// The id→shiki-name map lives in @sero-ai/common so the git plugin's diff pane
// colours code from the same setting without duplicating the table.
export { AUTO_EDITOR_THEME_ID, resolveShikiThemePair };
export type { ShikiThemeName, ShikiThemePair } from '@sero-ai/common';

export type EditorThemeKind = 'light' | 'dark';

export interface EditorThemeEntry {
  /** Stable identifier persisted to layout state. */
  id: string;
  /** Display label shown in the theme picker. */
  label: string;
  /** Whether the theme is light or dark (used to group them). */
  kind: EditorThemeKind;
  /** Monaco theme name passed to `<Editor theme={...}>`. */
  monacoName: string;
  /** Custom theme definition. Omit for built-in themes (vs, vs-dark, etc.). */
  data?: monacoApi.editor.IStandaloneThemeData;
}

export interface EditorThemePalette {
  background: string;
  foreground: string;
}

export const DEFAULT_EDITOR_THEME_ID = AUTO_EDITOR_THEME_ID;

/** Built-in monaco themes — no `defineTheme` call needed. */
const BUILTIN_THEMES: EditorThemeEntry[] = [
  { id: 'vs', label: 'Visual Studio Light', kind: 'light', monacoName: 'vs' },
  { id: 'vs-dark', label: 'Visual Studio Dark', kind: 'dark', monacoName: 'vs-dark' },
  { id: 'hc-light', label: 'High Contrast Light', kind: 'light', monacoName: 'hc-light' },
  { id: 'hc-black', label: 'High Contrast Dark', kind: 'dark', monacoName: 'hc-black' },
];

/** Custom themes — registered via `defineTheme` on first mount. */
const CUSTOM_THEMES: EditorThemeEntry[] = [
  {
    id: 'one-dark',
    label: 'One Dark',
    kind: 'dark',
    monacoName: 'sero-one-dark',
    data: {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '5c6370', fontStyle: 'italic' },
        { token: 'keyword', foreground: 'c678dd' },
        { token: 'string', foreground: '98c379' },
        { token: 'number', foreground: 'd19a66' },
        { token: 'type', foreground: 'e5c07b' },
        { token: 'function', foreground: '61afef' },
        { token: 'variable', foreground: 'e06c75' },
        { token: 'constant', foreground: 'd19a66' },
      ],
      colors: {
        'editor.background': '#282c34',
        'editor.foreground': '#abb2bf',
        'editor.lineHighlightBackground': '#2c313c',
        'editorLineNumber.foreground': '#4b5263',
        'editorLineNumber.activeForeground': '#abb2bf',
        'editor.selectionBackground': '#3e4451',
        'editorCursor.foreground': '#528bff',
        'editorIndentGuide.background1': '#3b4048',
      },
    },
  },
  {
    id: 'github-light',
    label: 'GitHub Light',
    kind: 'light',
    monacoName: 'sero-github-light',
    data: {
      base: 'vs',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '6a737d', fontStyle: 'italic' },
        { token: 'keyword', foreground: 'd73a49' },
        { token: 'string', foreground: '032f62' },
        { token: 'number', foreground: '005cc5' },
        { token: 'type', foreground: '6f42c1' },
        { token: 'function', foreground: '6f42c1' },
        { token: 'variable', foreground: '24292e' },
        { token: 'constant', foreground: '005cc5' },
      ],
      colors: {
        'editor.background': '#ffffff',
        'editor.foreground': '#24292e',
        'editor.lineHighlightBackground': '#f6f8fa',
        'editorLineNumber.foreground': '#959da5',
        'editorLineNumber.activeForeground': '#24292e',
        'editor.selectionBackground': '#0366d625',
        'editorCursor.foreground': '#044289',
      },
    },
  },
  {
    id: 'github-dark',
    label: 'GitHub Dark',
    kind: 'dark',
    monacoName: 'sero-github-dark',
    data: {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '8b949e', fontStyle: 'italic' },
        { token: 'keyword', foreground: 'ff7b72' },
        { token: 'string', foreground: 'a5d6ff' },
        { token: 'number', foreground: '79c0ff' },
        { token: 'type', foreground: 'ffa657' },
        { token: 'function', foreground: 'd2a8ff' },
        { token: 'variable', foreground: 'ffa657' },
        { token: 'constant', foreground: '79c0ff' },
      ],
      colors: {
        'editor.background': '#0d1117',
        'editor.foreground': '#c9d1d9',
        'editor.lineHighlightBackground': '#161b22',
        'editorLineNumber.foreground': '#484f58',
        'editorLineNumber.activeForeground': '#c9d1d9',
        'editor.selectionBackground': '#3392ff44',
        'editorCursor.foreground': '#58a6ff',
      },
    },
  },
  {
    id: 'dracula',
    label: 'Dracula',
    kind: 'dark',
    monacoName: 'sero-dracula',
    data: {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '6272a4', fontStyle: 'italic' },
        { token: 'keyword', foreground: 'ff79c6' },
        { token: 'string', foreground: 'f1fa8c' },
        { token: 'number', foreground: 'bd93f9' },
        { token: 'type', foreground: '8be9fd', fontStyle: 'italic' },
        { token: 'function', foreground: '50fa7b' },
        { token: 'variable', foreground: 'f8f8f2' },
        { token: 'constant', foreground: 'bd93f9' },
      ],
      colors: {
        'editor.background': '#282a36',
        'editor.foreground': '#f8f8f2',
        'editor.lineHighlightBackground': '#44475a55',
        'editorLineNumber.foreground': '#6272a4',
        'editorLineNumber.activeForeground': '#f8f8f2',
        'editor.selectionBackground': '#44475a',
        'editorCursor.foreground': '#f8f8f0',
      },
    },
  },
  {
    id: 'monokai',
    label: 'Monokai',
    kind: 'dark',
    monacoName: 'sero-monokai',
    data: {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '75715e', fontStyle: 'italic' },
        { token: 'keyword', foreground: 'f92672' },
        { token: 'string', foreground: 'e6db74' },
        { token: 'number', foreground: 'ae81ff' },
        { token: 'type', foreground: '66d9ef', fontStyle: 'italic' },
        { token: 'function', foreground: 'a6e22e' },
        { token: 'variable', foreground: 'f8f8f2' },
        { token: 'constant', foreground: 'ae81ff' },
      ],
      colors: {
        'editor.background': '#272822',
        'editor.foreground': '#f8f8f2',
        'editor.lineHighlightBackground': '#3e3d32',
        'editorLineNumber.foreground': '#90908a',
        'editorLineNumber.activeForeground': '#f8f8f2',
        'editor.selectionBackground': '#49483e',
        'editorCursor.foreground': '#f8f8f0',
      },
    },
  },
  {
    id: 'solarized-light',
    label: 'Solarized Light',
    kind: 'light',
    monacoName: 'sero-solarized-light',
    data: {
      base: 'vs',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '93a1a1', fontStyle: 'italic' },
        { token: 'keyword', foreground: '859900' },
        { token: 'string', foreground: '2aa198' },
        { token: 'number', foreground: 'd33682' },
        { token: 'type', foreground: 'b58900' },
        { token: 'function', foreground: '268bd2' },
        { token: 'variable', foreground: '586e75' },
        { token: 'constant', foreground: 'cb4b16' },
      ],
      colors: {
        'editor.background': '#fdf6e3',
        'editor.foreground': '#586e75',
        'editor.lineHighlightBackground': '#eee8d5',
        'editorLineNumber.foreground': '#93a1a1',
        'editorLineNumber.activeForeground': '#586e75',
        'editor.selectionBackground': '#eee8d5',
        'editorCursor.foreground': '#586e75',
      },
    },
  },
  {
    id: 'solarized-dark',
    label: 'Solarized Dark',
    kind: 'dark',
    monacoName: 'sero-solarized-dark',
    data: {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '586e75', fontStyle: 'italic' },
        { token: 'keyword', foreground: '859900' },
        { token: 'string', foreground: '2aa198' },
        { token: 'number', foreground: 'd33682' },
        { token: 'type', foreground: 'b58900' },
        { token: 'function', foreground: '268bd2' },
        { token: 'variable', foreground: '93a1a1' },
        { token: 'constant', foreground: 'cb4b16' },
      ],
      colors: {
        'editor.background': '#002b36',
        'editor.foreground': '#93a1a1',
        'editor.lineHighlightBackground': '#073642',
        'editorLineNumber.foreground': '#586e75',
        'editorLineNumber.activeForeground': '#93a1a1',
        'editor.selectionBackground': '#073642',
        'editorCursor.foreground': '#93a1a1',
      },
    },
  },
  {
    id: 'nord',
    label: 'Nord',
    kind: 'dark',
    monacoName: 'sero-nord',
    data: {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '616e88', fontStyle: 'italic' },
        { token: 'keyword', foreground: '81a1c1' },
        { token: 'string', foreground: 'a3be8c' },
        { token: 'number', foreground: 'b48ead' },
        { token: 'type', foreground: '8fbcbb' },
        { token: 'function', foreground: '88c0d0' },
        { token: 'variable', foreground: 'd8dee9' },
        { token: 'constant', foreground: '5e81ac' },
      ],
      colors: {
        'editor.background': '#2e3440',
        'editor.foreground': '#d8dee9',
        'editor.lineHighlightBackground': '#3b4252',
        'editorLineNumber.foreground': '#4c566a',
        'editorLineNumber.activeForeground': '#d8dee9',
        'editor.selectionBackground': '#434c5e',
        'editorCursor.foreground': '#d8dee9',
      },
    },
  },
];

/** All themes (built-in + custom), in display order. */
export const EDITOR_THEMES: EditorThemeEntry[] = [...BUILTIN_THEMES, ...CUSTOM_THEMES];

const THEME_BY_ID = new Map(EDITOR_THEMES.map((entry) => [entry.id, entry]));

export function getEditorTheme(id: string): EditorThemeEntry | undefined {
  return THEME_BY_ID.get(id);
}

/**
 * Resolve a theme id to the monaco theme name to apply.
 *
 * 'auto' (and any unknown id) maps to 'vs-dark' or 'vs' depending on the
 * effective UI mode.
 */
export function resolveMonacoThemeName(
  id: string,
  effectiveMode: 'light' | 'dark',
): string {
  if (id === AUTO_EDITOR_THEME_ID) {
    return effectiveMode === 'dark' ? 'vs-dark' : 'vs';
  }
  const entry = THEME_BY_ID.get(id);
  if (!entry) return effectiveMode === 'dark' ? 'vs-dark' : 'vs';
  return entry.monacoName;
}

function getBuiltInPalette(id: string): EditorThemePalette | null {
  switch (id) {
    case 'vs':
      return { background: '#ffffff', foreground: '#000000' };
    case 'vs-dark':
      return { background: '#1e1e1e', foreground: '#d4d4d4' };
    case 'hc-light':
      return { background: '#ffffff', foreground: '#000000' };
    case 'hc-black':
      return { background: '#000000', foreground: '#ffffff' };
    default:
      return null;
  }
}

export function resolveEditorThemePalette(
  id: string,
  effectiveMode: 'light' | 'dark',
): EditorThemePalette {
  const resolvedId = id === AUTO_EDITOR_THEME_ID
    ? effectiveMode === 'dark' ? 'vs-dark' : 'vs'
    : id;
  const builtIn = getBuiltInPalette(resolvedId);
  if (builtIn) return builtIn;

  const colors = THEME_BY_ID.get(resolvedId)?.data?.colors;
  return {
    background: colors?.['editor.background'] ?? (effectiveMode === 'dark' ? '#1e1e1e' : '#ffffff'),
    foreground: colors?.['editor.foreground'] ?? (effectiveMode === 'dark' ? '#d4d4d4' : '#000000'),
  };
}

// Every shared theme name must be one shiki actually bundles. This fails the
// build if a name added to @sero-ai/common isn't a valid `ThemeInput`.
type ShikiNamesAreBundled = ShikiThemeName extends Extract<ThemeInput, string> ? true : never;
const shikiNamesAreBundled: ShikiNamesAreBundled = true;
void shikiNamesAreBundled;

export function resolveMarkdownCodeThemes(id: string): [ThemeInput, ThemeInput] {
  const { light, dark } = resolveShikiThemePair(id);
  return [light, dark];
}

/**
 * Register all custom themes with Monaco. Safe to call multiple times —
 * `defineTheme` is idempotent.
 */
export function registerCustomEditorThemes(monaco: typeof monacoApi): void {
  for (const entry of CUSTOM_THEMES) {
    if (!entry.data) continue;
    monaco.editor.defineTheme(entry.monacoName, entry.data);
  }
}

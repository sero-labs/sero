/**
 * Monaco Editor setup for Vite + Electron.
 * Must be imported BEFORE any <Editor /> component mounts.
 *
 * Configures @monaco-editor/react to use the local monaco-editor package
 * and sets up web workers for tokenization, language services, etc.
 */
import * as monaco from 'monaco-editor';
import { loader } from '@monaco-editor/react';

// Import workers as Vite worker modules
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';

// Set up MonacoEnvironment to provide the correct worker for each language
self.MonacoEnvironment = {
  getWorker(_: string, label: string) {
    if (label === 'json') return new jsonWorker();
    if (label === 'css' || label === 'scss' || label === 'less') return new cssWorker();
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new htmlWorker();
    if (label === 'typescript' || label === 'javascript') return new tsWorker();
    return new editorWorker();
  },
};

// Tell @monaco-editor/react to use the local monaco-editor instead of CDN
loader.config({ monaco });

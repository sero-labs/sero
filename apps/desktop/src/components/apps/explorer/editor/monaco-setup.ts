/**
 * Bundles Monaco with the app instead of fetching it from a CDN at runtime.
 *
 * @monaco-editor/react defaults to loading Monaco from jsdelivr, which means no
 * editor when the machine is offline, and a Monaco version chosen by a
 * transitive dependency rather than by us. loader.config({ monaco }) points it
 * at the copy Vite bundles from the pinned monaco-editor package instead.
 *
 * Language workers have to be wired up by hand: Monaco asks MonacoEnvironment
 * for them, and Vite's ?worker imports give us a bundled worker per language.
 */

import { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import type { Environment } from 'monaco-editor';
import EditorWorker from 'monaco-editor/editor/editor.worker?worker';
import CssWorker from 'monaco-editor/language/css/css.worker?worker';
import HtmlWorker from 'monaco-editor/language/html/html.worker?worker';
import JsonWorker from 'monaco-editor/language/json/json.worker?worker';
import TsWorker from 'monaco-editor/language/typescript/ts.worker?worker';

declare global {
  interface Window {
    MonacoEnvironment?: Environment;
  }
}

window.MonacoEnvironment = {
  getWorker(_workerId: string, label: string) {
    switch (label) {
      case 'json':
        return new JsonWorker();
      case 'css':
      case 'scss':
      case 'less':
        return new CssWorker();
      case 'html':
      case 'handlebars':
      case 'razor':
        return new HtmlWorker();
      case 'typescript':
      case 'javascript':
        return new TsWorker();
      default:
        return new EditorWorker();
    }
  },
};

loader.config({ monaco });

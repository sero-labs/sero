/**
 * TUI renderer for the question tool (Pi CLI interactive mode).
 *
 * Shows an options list with keyboard navigation and an optional
 * "Type something…" inline editor. Only used when ctx.hasUI === true.
 */

import { Editor, type EditorTheme, Key, matchesKey, truncateToWidth } from '@earendil-works/pi-tui';
import type { ExtensionUIContext } from '@earendil-works/pi-coding-agent';
import type { QuestionItem, QuestionAnswer } from '../shared/types';

interface DisplayOption {
  value: string;
  label: string;
  description?: string;
  isOther?: boolean;
}

/**
 * Show a single question via TUI custom UI and return the user's answer.
 * Returns null if cancelled.
 */
export async function askQuestionTUI(
  ui: ExtensionUIContext,
  question: QuestionItem,
): Promise<QuestionAnswer | null> {
  const allOptions: DisplayOption[] = [
    ...question.options,
    ...(question.allowOther ? [{ value: '__other__', label: 'Type something.', isOther: true }] : []),
  ];

  const result = await ui.custom<{ answer: string; wasCustom: boolean; index?: number } | null>(
    (tui, theme, _kb, done) => {
      let optionIndex = 0;
      let editMode = false;
      let cachedLines: string[] | undefined;

      const editorTheme: EditorTheme = {
        borderColor: (s) => theme.fg('accent', s),
        selectList: {
          selectedPrefix: (t) => theme.fg('accent', t),
          selectedText: (t) => theme.fg('accent', t),
          description: (t) => theme.fg('muted', t),
          scrollInfo: (t) => theme.fg('dim', t),
          noMatch: (t) => theme.fg('warning', t),
        },
      };
      const editor = new Editor(tui, editorTheme);

      editor.onSubmit = (value) => {
        const trimmed = value.trim();
        if (trimmed) {
          done({ answer: trimmed, wasCustom: true });
        } else {
          editMode = false;
          editor.setText('');
          refresh();
        }
      };

      function refresh() {
        cachedLines = undefined;
        tui.requestRender();
      }

      function handleInput(data: string) {
        if (editMode) {
          if (matchesKey(data, Key.escape)) {
            editMode = false;
            editor.setText('');
            refresh();
            return;
          }
          editor.handleInput(data);
          refresh();
          return;
        }

        if (matchesKey(data, Key.up)) {
          optionIndex = Math.max(0, optionIndex - 1);
          refresh();
          return;
        }
        if (matchesKey(data, Key.down)) {
          optionIndex = Math.min(allOptions.length - 1, optionIndex + 1);
          refresh();
          return;
        }
        if (matchesKey(data, Key.enter)) {
          const selected = allOptions[optionIndex];
          if (selected.isOther) {
            editMode = true;
            refresh();
          } else {
            done({ answer: selected.label, wasCustom: false, index: optionIndex + 1 });
          }
          return;
        }
        if (matchesKey(data, Key.escape)) {
          done(null);
        }
      }

      function render(width: number): string[] {
        if (cachedLines) return cachedLines;
        const lines: string[] = [];
        const add = (s: string) => lines.push(truncateToWidth(s, width));

        add(theme.fg('accent', '─'.repeat(width)));
        add(theme.fg('text', ` ${question.prompt}`));
        lines.push('');

        for (let i = 0; i < allOptions.length; i++) {
          const opt = allOptions[i];
          const selected = i === optionIndex;
          const prefix = selected ? theme.fg('accent', '> ') : '  ';

          if (opt.isOther && editMode) {
            add(prefix + theme.fg('accent', `${i + 1}. ${opt.label} ✎`));
          } else if (selected) {
            add(prefix + theme.fg('accent', `${i + 1}. ${opt.label}`));
          } else {
            add(`  ${theme.fg('text', `${i + 1}. ${opt.label}`)}`);
          }
          if (opt.description) {
            add(`     ${theme.fg('muted', opt.description)}`);
          }
        }

        if (editMode) {
          lines.push('');
          add(theme.fg('muted', ' Your answer:'));
          for (const line of editor.render(width - 2)) add(` ${line}`);
        }

        lines.push('');
        const hint = editMode
          ? ' Enter to submit • Esc to go back'
          : ' ↑↓ navigate • Enter to select • Esc to cancel';
        add(theme.fg('dim', hint));
        add(theme.fg('accent', '─'.repeat(width)));

        cachedLines = lines;
        return lines;
      }

      return { render, invalidate: () => { cachedLines = undefined; }, handleInput };
    },
  );

  if (!result) return null;

  return {
    questionId: question.id,
    value: result.wasCustom ? result.answer : question.options[(result.index ?? 1) - 1]?.value ?? result.answer,
    label: result.answer,
    wasCustom: result.wasCustom,
    index: result.index,
  };
}

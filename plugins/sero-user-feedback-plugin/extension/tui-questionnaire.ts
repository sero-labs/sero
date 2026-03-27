/**
 * TUI renderer for the questionnaire tool (Pi CLI interactive mode).
 *
 * Shows a tab-based interface for multiple questions with keyboard navigation.
 * Only used when ctx.hasUI === true.
 */

import { Editor, type EditorTheme, Key, matchesKey, truncateToWidth } from '@mariozechner/pi-tui';
import type { ExtensionUIContext, Theme } from '@mariozechner/pi-coding-agent';
import type { QuestionItem, QuestionAnswer } from '../shared/types';

interface RenderOption {
  value: string;
  label: string;
  description?: string;
  isOther?: boolean;
}

interface QuestionnaireResult {
  answers: QuestionAnswer[];
  cancelled: boolean;
}

export async function askQuestionnaireTUI(
  ui: ExtensionUIContext,
  questions: QuestionItem[],
): Promise<QuestionnaireResult> {
  const isMulti = questions.length > 1;
  const totalTabs = questions.length + 1;

  return ui.custom<QuestionnaireResult>((tui, theme, _kb, done) => {
    let currentTab = 0;
    let optionIndex = 0;
    let inputMode = false;
    let inputQuestionId: string | null = null;
    let cachedLines: string[] | undefined;
    const answers = new Map<string, QuestionAnswer>();

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

    function refresh() { cachedLines = undefined; tui.requestRender(); }
    function submit(cancelled: boolean) {
      done({ answers: Array.from(answers.values()), cancelled });
    }
    function currentQuestion(): QuestionItem | undefined { return questions[currentTab]; }
    function currentOptions(): RenderOption[] {
      const q = currentQuestion();
      if (!q) return [];
      const opts: RenderOption[] = [...q.options];
      if (q.allowOther) opts.push({ value: '__other__', label: 'Type something.', isOther: true });
      return opts;
    }
    function allAnswered() { return questions.every((q) => answers.has(q.id)); }

    function advanceAfterAnswer() {
      if (!isMulti) { submit(false); return; }
      if (currentTab < questions.length - 1) currentTab++;
      else currentTab = questions.length;
      optionIndex = 0;
      refresh();
    }

    function saveAnswer(qId: string, value: string, label: string, wasCustom: boolean, index?: number) {
      answers.set(qId, { questionId: qId, value, label, wasCustom, index });
    }

    editor.onSubmit = (value) => {
      if (!inputQuestionId) return;
      const trimmed = value.trim() || '(no response)';
      saveAnswer(inputQuestionId, trimmed, trimmed, true);
      inputMode = false;
      inputQuestionId = null;
      editor.setText('');
      advanceAfterAnswer();
    };

    function handleInput(data: string) {
      if (inputMode) {
        if (matchesKey(data, Key.escape)) {
          inputMode = false; inputQuestionId = null; editor.setText(''); refresh();
          return;
        }
        editor.handleInput(data); refresh(); return;
      }

      const q = currentQuestion();
      const opts = currentOptions();

      if (isMulti) {
        if (matchesKey(data, Key.tab) || matchesKey(data, Key.right)) {
          currentTab = (currentTab + 1) % totalTabs; optionIndex = 0; refresh(); return;
        }
        if (matchesKey(data, Key.shift('tab')) || matchesKey(data, Key.left)) {
          currentTab = (currentTab - 1 + totalTabs) % totalTabs; optionIndex = 0; refresh(); return;
        }
      }

      if (currentTab === questions.length) {
        if (matchesKey(data, Key.enter) && allAnswered()) submit(false);
        else if (matchesKey(data, Key.escape)) submit(true);
        return;
      }

      if (matchesKey(data, Key.up)) { optionIndex = Math.max(0, optionIndex - 1); refresh(); return; }
      if (matchesKey(data, Key.down)) { optionIndex = Math.min(opts.length - 1, optionIndex + 1); refresh(); return; }

      if (matchesKey(data, Key.enter) && q) {
        const opt = opts[optionIndex];
        if (opt.isOther) { inputMode = true; inputQuestionId = q.id; editor.setText(''); refresh(); return; }
        saveAnswer(q.id, opt.value, opt.label, false, optionIndex + 1);
        advanceAfterAnswer(); return;
      }

      if (matchesKey(data, Key.escape)) submit(true);
    }

    function render(width: number): string[] {
      if (cachedLines) return cachedLines;
      const lines: string[] = [];
      const add = (s: string) => lines.push(truncateToWidth(s, width));
      const q = currentQuestion();
      const opts = currentOptions();

      add(theme.fg('accent', '─'.repeat(width)));

      if (isMulti) {
        const tabs = renderTabBar(questions, currentTab, answers, allAnswered(), theme);
        add(` ${tabs}`);
        lines.push('');
      }

      if (inputMode && q) {
        add(theme.fg('text', ` ${q.prompt}`));
        lines.push('');
        renderOptionsList(opts, optionIndex, inputMode, theme, add);
        lines.push('');
        add(theme.fg('muted', ' Your answer:'));
        for (const line of editor.render(width - 2)) add(` ${line}`);
        lines.push('');
        add(theme.fg('dim', ' Enter to submit • Esc to cancel'));
      } else if (currentTab === questions.length) {
        renderSubmitTab(questions, answers, allAnswered(), theme, add);
      } else if (q) {
        add(theme.fg('text', ` ${q.prompt}`));
        lines.push('');
        renderOptionsList(opts, optionIndex, false, theme, add);
      }

      lines.push('');
      if (!inputMode) {
        const help = isMulti
          ? ' Tab/←→ navigate • ↑↓ select • Enter confirm • Esc cancel'
          : ' ↑↓ navigate • Enter select • Esc cancel';
        add(theme.fg('dim', help));
      }
      add(theme.fg('accent', '─'.repeat(width)));

      cachedLines = lines;
      return lines;
    }

    return { render, invalidate: () => { cachedLines = undefined; }, handleInput };
  });
}

// ── Render helpers ─────────────────────────────────────────────

function renderTabBar(
  questions: QuestionItem[],
  currentTab: number,
  answers: Map<string, QuestionAnswer>,
  canSubmit: boolean,
  theme: Theme,
): string {
  const parts: string[] = ['← '];
  for (let i = 0; i < questions.length; i++) {
    const isActive = i === currentTab;
    const isAnswered = answers.has(questions[i].id);
    const lbl = questions[i].label;
    const box = isAnswered ? '■' : '□';
    const color = isAnswered ? 'success' : 'muted';
    const text = ` ${box} ${lbl} `;
    parts.push(isActive ? theme.bg('selectedBg', theme.fg('text', text)) : theme.fg(color, text));
    parts.push(' ');
  }
  const isSubmitTab = currentTab === questions.length;
  const submitText = ' ✓ Submit ';
  const submitStyled = isSubmitTab
    ? theme.bg('selectedBg', theme.fg('text', submitText))
    : theme.fg(canSubmit ? 'success' : 'dim', submitText);
  parts.push(`${submitStyled} →`);
  return parts.join('');
}

function renderOptionsList(
  opts: RenderOption[],
  selectedIndex: number,
  inputMode: boolean,
  theme: Theme,
  add: (s: string) => void,
) {
  for (let i = 0; i < opts.length; i++) {
    const opt = opts[i];
    const selected = i === selectedIndex;
    const prefix = selected ? theme.fg('accent', '> ') : '  ';
    const color = selected ? 'accent' : 'text';

    if (opt.isOther && inputMode) {
      add(prefix + theme.fg('accent', `${i + 1}. ${opt.label} ✎`));
    } else {
      add(prefix + theme.fg(color, `${i + 1}. ${opt.label}`));
    }
    if (opt.description) add(`     ${theme.fg('muted', opt.description)}`);
  }
}

function renderSubmitTab(
  questions: QuestionItem[],
  answers: Map<string, QuestionAnswer>,
  canSubmit: boolean,
  theme: Theme,
  add: (s: string) => void,
) {
  add(theme.fg('accent', theme.bold(' Ready to submit')));
  add('');
  for (const q of questions) {
    const answer = answers.get(q.id);
    if (answer) {
      const prefix = answer.wasCustom ? '(wrote) ' : '';
      add(`${theme.fg('muted', ` ${q.label}: `)}${theme.fg('text', prefix + answer.label)}`);
    }
  }
  add('');
  if (canSubmit) {
    add(theme.fg('success', ' Press Enter to submit'));
  } else {
    const missing = questions.filter((q) => !answers.has(q.id)).map((q) => q.label).join(', ');
    add(theme.fg('warning', ` Unanswered: ${missing}`));
  }
}

/**
 * TUI renderer for the questionnaire tool (Pi CLI interactive mode).
 *
 * Shows a tab-based interface for multiple questions with keyboard navigation.
 * Only used when ctx.hasUI === true.
 */

import { Editor, type EditorTheme, Key, matchesKey, truncateToWidth } from '@mariozechner/pi-tui';
import type { ExtensionUIContext, Theme } from '@mariozechner/pi-coding-agent';
import type { QuestionItem, QuestionAnswer, QuestionOption } from '../shared/types';

interface RenderOption extends QuestionOption {
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
  const hasSubmitTab = questions.length > 1 || questions.some((q) => q.multiSelect === true);
  const totalTabs = hasSubmitTab ? questions.length + 1 : questions.length;

  return ui.custom<QuestionnaireResult>((tui, theme, _kb, done) => {
    let currentTab = 0;
    let optionIndex = 0;
    let inputMode = false;
    let inputQuestionId: string | null = null;
    let cachedLines: string[] | undefined;
    const answers = new Map<string, QuestionAnswer[]>();

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

    function refresh() {
      cachedLines = undefined;
      tui.requestRender();
    }

    function flattenAnswers(): QuestionAnswer[] {
      return questions.flatMap((q) => answers.get(q.id) ?? []);
    }

    function submit(cancelled: boolean) {
      done({ answers: cancelled ? [] : flattenAnswers(), cancelled });
    }

    function currentQuestion(): QuestionItem | undefined {
      return questions[currentTab];
    }

    function findOption(question: QuestionItem, value: string): QuestionOption | undefined {
      return question.options.find((opt) => opt.value === value);
    }

    function getAnswers(qId: string): QuestionAnswer[] {
      return answers.get(qId) ?? [];
    }

    function getCustomAnswer(qId: string): QuestionAnswer | undefined {
      return getAnswers(qId).find((answer) => answer.wasCustom);
    }

    function setQuestionAnswers(qId: string, nextAnswers: QuestionAnswer[]): void {
      if (nextAnswers.length === 0) {
        answers.delete(qId);
        return;
      }
      answers.set(qId, nextAnswers);
    }

    function currentOptions(): RenderOption[] {
      const q = currentQuestion();
      if (!q) return [];
      const opts: RenderOption[] = [...q.options];
      if (q.allowOther) opts.push({ value: '__other__', label: 'Type something.', isOther: true });
      return opts;
    }

    function isAnswered(qId: string): boolean {
      return getAnswers(qId).length > 0;
    }

    function allAnswered(): boolean {
      return questions.every((q) => isAnswered(q.id));
    }

    function advanceAfterAnswer() {
      if (!hasSubmitTab) {
        submit(false);
        return;
      }
      if (currentTab < questions.length - 1) currentTab++;
      else currentTab = questions.length;
      optionIndex = 0;
      refresh();
    }

    function openCustomInput(question: QuestionItem): void {
      inputMode = true;
      inputQuestionId = question.id;
      editor.setText(getCustomAnswer(question.id)?.label ?? '');
      refresh();
    }

    function toggleOption(question: QuestionItem, opt: RenderOption, index: number): void {
      const nextAnswer: QuestionAnswer = {
        questionId: question.id,
        value: opt.value,
        label: opt.label,
        wasCustom: false,
        index: index + 1,
      };

      if (question.multiSelect !== true) {
        setQuestionAnswers(question.id, [nextAnswer]);
        advanceAfterAnswer();
        return;
      }

      const currentAnswers = getAnswers(question.id);
      const isAlreadySelected = currentAnswers.some(
        (answer) => !answer.wasCustom && answer.value === opt.value,
      );

      if (isAlreadySelected) {
        setQuestionAnswers(
          question.id,
          currentAnswers.filter((answer) => answer.wasCustom || answer.value !== opt.value),
        );
        refresh();
        return;
      }

      if (opt.exclusive) {
        setQuestionAnswers(question.id, [nextAnswer]);
        refresh();
        return;
      }

      const nextAnswers = currentAnswers.filter((answer) => {
        if (answer.wasCustom) return true;
        return !findOption(question, answer.value)?.exclusive;
      });
      nextAnswers.push(nextAnswer);
      setQuestionAnswers(question.id, nextAnswers);
      refresh();
    }

    function upsertCustomAnswer(question: QuestionItem, text: string): void {
      const customAnswer: QuestionAnswer = {
        questionId: question.id,
        value: text,
        label: text,
        wasCustom: true,
      };

      if (question.multiSelect !== true) {
        setQuestionAnswers(question.id, [customAnswer]);
        advanceAfterAnswer();
        return;
      }

      const nextAnswers = getAnswers(question.id).filter((answer) => {
        if (answer.wasCustom) return false;
        return !findOption(question, answer.value)?.exclusive;
      });
      nextAnswers.push(customAnswer);
      setQuestionAnswers(question.id, nextAnswers);
      refresh();
    }

    editor.onSubmit = (value) => {
      if (!inputQuestionId) return;
      const question = questions.find((q) => q.id === inputQuestionId);
      if (!question) return;
      const trimmed = value.trim();
      if (!trimmed) return;
      inputMode = false;
      inputQuestionId = null;
      editor.setText('');
      upsertCustomAnswer(question, trimmed);
    };

    function handleInput(data: string) {
      if (inputMode) {
        if (matchesKey(data, Key.escape)) {
          inputMode = false;
          inputQuestionId = null;
          editor.setText('');
          refresh();
          return;
        }
        editor.handleInput(data);
        refresh();
        return;
      }

      const q = currentQuestion();
      const opts = currentOptions();

      if (hasSubmitTab) {
        if (matchesKey(data, Key.tab) || matchesKey(data, Key.right)) {
          currentTab = (currentTab + 1) % totalTabs;
          optionIndex = 0;
          refresh();
          return;
        }
        if (matchesKey(data, Key.shift('tab')) || matchesKey(data, Key.left)) {
          currentTab = (currentTab - 1 + totalTabs) % totalTabs;
          optionIndex = 0;
          refresh();
          return;
        }
      }

      if (hasSubmitTab && currentTab === questions.length) {
        if (matchesKey(data, Key.enter) && allAnswered()) submit(false);
        else if (matchesKey(data, Key.escape)) submit(true);
        return;
      }

      if (matchesKey(data, Key.up)) {
        optionIndex = Math.max(0, optionIndex - 1);
        refresh();
        return;
      }
      if (matchesKey(data, Key.down)) {
        optionIndex = Math.min(opts.length - 1, optionIndex + 1);
        refresh();
        return;
      }

      if ((matchesKey(data, Key.enter) || data === ' ') && q) {
        const opt = opts[optionIndex];
        if (!opt) return;
        if (opt.isOther) {
          openCustomInput(q);
          return;
        }
        toggleOption(q, opt, optionIndex);
        return;
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

      if (hasSubmitTab) {
        const tabs = renderTabBar(questions, currentTab, answers, allAnswered(), theme);
        add(` ${tabs}`);
        lines.push('');
      }

      if (inputMode && q) {
        add(theme.fg('text', ` ${q.prompt}`));
        lines.push('');
        renderOptionsList(q, opts, getAnswers(q.id), optionIndex, inputMode, theme, add);
        lines.push('');
        add(theme.fg('muted', ' Your answer:'));
        for (const line of editor.render(width - 2)) add(` ${line}`);
        lines.push('');
        add(theme.fg('dim', ' Enter to submit • Esc to cancel'));
      } else if (hasSubmitTab && currentTab === questions.length) {
        renderSubmitTab(questions, answers, allAnswered(), theme, add);
      } else if (q) {
        add(theme.fg('text', ` ${q.prompt}`));
        lines.push('');
        renderOptionsList(q, opts, getAnswers(q.id), optionIndex, false, theme, add);
      }

      lines.push('');
      if (!inputMode) {
        const help = buildHelpText(q, hasSubmitTab);
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

function buildHelpText(question: QuestionItem | undefined, hasSubmitTab: boolean): string {
  if (question?.multiSelect) {
    return hasSubmitTab
      ? ' Tab/←→ navigate • ↑↓ select • Enter/Space toggle • Esc cancel'
      : ' ↑↓ navigate • Enter/Space toggle • Esc cancel';
  }
  return hasSubmitTab
    ? ' Tab/←→ navigate • ↑↓ select • Enter confirm • Esc cancel'
    : ' ↑↓ navigate • Enter select • Esc cancel';
}

function renderTabBar(
  questions: QuestionItem[],
  currentTab: number,
  answers: Map<string, QuestionAnswer[]>,
  canSubmit: boolean,
  theme: Theme,
): string {
  const parts: string[] = ['← '];
  for (let i = 0; i < questions.length; i++) {
    const isActive = i === currentTab;
    const isAnswered = (answers.get(questions[i].id)?.length ?? 0) > 0;
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
  question: QuestionItem,
  opts: RenderOption[],
  answers: QuestionAnswer[],
  selectedIndex: number,
  inputMode: boolean,
  theme: Theme,
  add: (s: string) => void,
) {
  const customAnswer = answers.find((answer) => answer.wasCustom);

  if (question.multiSelect) {
    add(theme.fg('muted', ' Select one or more options, then move to Submit when ready.'));
    add('');
  }

  for (let i = 0; i < opts.length; i++) {
    const opt = opts[i];
    const selected = i === selectedIndex;
    const isChecked = answers.some((answer) => !answer.wasCustom && answer.value === opt.value);
    const prefix = selected ? theme.fg('accent', '> ') : '  ';
    const color = selected ? 'accent' : 'text';
    const marker = question.multiSelect
      ? `${isChecked ? '☑' : '☐'} ${opt.label}`
      : `${i + 1}. ${opt.label}`;

    if (opt.isOther && inputMode) {
      add(prefix + theme.fg('accent', `${marker} ✎`));
    } else {
      add(prefix + theme.fg(color, marker));
    }
    if (opt.description) add(`     ${theme.fg('muted', opt.description)}`);
  }

  if (customAnswer) {
    add('');
    add(`  ${theme.fg('success', `✎ Custom: ${customAnswer.label}`)}`);
  }
}

function renderSubmitTab(
  questions: QuestionItem[],
  answers: Map<string, QuestionAnswer[]>,
  canSubmit: boolean,
  theme: Theme,
  add: (s: string) => void,
) {
  add(theme.fg('accent', theme.bold(' Ready to submit')));
  add('');
  for (const q of questions) {
    const questionAnswers = answers.get(q.id) ?? [];
    if (questionAnswers.length > 0) {
      const formatted = questionAnswers.map((answer) => {
        if (answer.wasCustom) return `(wrote) ${answer.label}`;
        return answer.index ? `${answer.index}. ${answer.label}` : answer.label;
      });
      add(`${theme.fg('muted', ` ${q.label}: `)}${theme.fg('text', formatted.join(', '))}`);
      continue;
    }
    add(`${theme.fg('muted', ` ${q.label}: `)}${theme.fg('warning', 'Skipped')}`);
  }
  add('');
  if (canSubmit) {
    add(theme.fg('success', ' Press Enter to submit'));
  } else {
    const missing = questions.filter((q) => (answers.get(q.id)?.length ?? 0) === 0).map((q) => q.label).join(', ');
    add(theme.fg('warning', ` Unanswered: ${missing}`));
  }
}

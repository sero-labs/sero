/**
 * TUI renderer for the questionnaire tool (Pi CLI interactive mode).
 *
 * Shows a tab-based interface for multiple questions with keyboard navigation.
 * Only used when ctx.hasUI === true.
 */

import { Editor, type EditorTheme, Key, matchesKey } from '@mariozechner/pi-tui';
import type { ExtensionUIContext } from '@mariozechner/pi-coding-agent';

import {
  canSubmitQuestionnaire,
  flattenQuestionnaireAnswers,
  getCustomAnswer,
  getQuestionAnswers,
  hasQuestionAnswer,
  selectQuestionOption,
  submitCustomQuestionAnswer,
  updateQuestionAnswers,
  type AnswerMap,
} from '../shared/questionnaire-flow';
import type { QuestionAnswer, QuestionItem } from '../shared/types';
import {
  addTruncatedLine,
  buildHelpText,
  renderOptionsList,
  renderSubmitTab,
  renderTabBar,
  type RenderOption,
} from './tui-questionnaire-render';

interface QuestionnaireResult {
  answers: QuestionAnswer[];
  cancelled: boolean;
}

export async function askQuestionnaireTUI(
  ui: ExtensionUIContext,
  questions: QuestionItem[],
): Promise<QuestionnaireResult> {
  const hasSubmitTab =
    questions.length > 1 || questions.some((question) => question.multiSelect === true);
  const totalTabs = hasSubmitTab ? questions.length + 1 : questions.length;

  return ui.custom<QuestionnaireResult>((tui, theme, _kb, done) => {
    let currentTab = 0;
    let optionIndex = 0;
    let inputMode = false;
    let inputQuestionId: string | null = null;
    let cachedLines: string[] | undefined;
    let answers: AnswerMap = new Map();

    const editorTheme: EditorTheme = {
      borderColor: (style) => theme.fg('accent', style),
      selectList: {
        selectedPrefix: (text) => theme.fg('accent', text),
        selectedText: (text) => theme.fg('accent', text),
        description: (text) => theme.fg('muted', text),
        scrollInfo: (text) => theme.fg('dim', text),
        noMatch: (text) => theme.fg('warning', text),
      },
    };
    const editor = new Editor(tui, editorTheme);

    function refresh() {
      cachedLines = undefined;
      tui.requestRender();
    }

    function submit(cancelled: boolean) {
      done({
        answers: cancelled ? [] : flattenQuestionnaireAnswers(questions, answers),
        cancelled,
      });
    }

    function currentQuestion(): QuestionItem | undefined {
      return questions[currentTab];
    }

    function setQuestionAnswers(questionId: string, nextAnswers: QuestionAnswer[]): void {
      answers = updateQuestionAnswers(answers, questionId, nextAnswers);
    }

    function currentOptions(): RenderOption[] {
      const question = currentQuestion();
      if (!question) return [];

      const options: RenderOption[] = [...question.options];
      if (question.allowOther) {
        options.push({ value: '__other__', label: 'Type something.', isOther: true });
      }
      return options;
    }

    function canSubmit(): boolean {
      return canSubmitQuestionnaire(questions, answers);
    }

    function advanceAfterAnswer() {
      if (!hasSubmitTab) {
        submit(false);
        return;
      }

      if (currentTab < questions.length - 1) {
        currentTab++;
      } else {
        currentTab = questions.length;
      }
      optionIndex = 0;
      refresh();
    }

    function openCustomInput(question: QuestionItem): void {
      inputMode = true;
      inputQuestionId = question.id;
      editor.setText(getCustomAnswer(getQuestionAnswers(answers, question.id))?.label ?? '');
      refresh();
    }

    function toggleOption(question: QuestionItem, option: RenderOption, index: number): void {
      const nextAnswers = selectQuestionOption(
        question,
        option,
        index,
        getQuestionAnswers(answers, question.id),
      );
      setQuestionAnswers(question.id, nextAnswers);
      if (question.multiSelect !== true) {
        advanceAfterAnswer();
        return;
      }
      refresh();
    }

    function upsertCustomAnswer(question: QuestionItem, text: string): void {
      const nextAnswers = submitCustomQuestionAnswer(
        question,
        getQuestionAnswers(answers, question.id),
        text,
      );
      setQuestionAnswers(question.id, nextAnswers);
      if (question.multiSelect !== true) {
        advanceAfterAnswer();
        return;
      }
      refresh();
    }

    editor.onSubmit = (value) => {
      if (!inputQuestionId) return;
      const question = questions.find((item) => item.id === inputQuestionId);
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

      const question = currentQuestion();
      const options = currentOptions();

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
        if (matchesKey(data, Key.enter) && canSubmit()) {
          submit(false);
        } else if (matchesKey(data, Key.escape)) {
          submit(true);
        }
        return;
      }

      if (matchesKey(data, Key.up)) {
        optionIndex = Math.max(0, optionIndex - 1);
        refresh();
        return;
      }
      if (matchesKey(data, Key.down)) {
        optionIndex = Math.min(options.length - 1, optionIndex + 1);
        refresh();
        return;
      }

      if ((matchesKey(data, Key.enter) || data === ' ') && question) {
        const option = options[optionIndex];
        if (!option) return;
        if (option.isOther) {
          openCustomInput(question);
          return;
        }

        toggleOption(question, option, optionIndex);
        return;
      }

      if (matchesKey(data, Key.escape)) {
        submit(true);
      }
    }

    function render(width: number): string[] {
      if (cachedLines) return cachedLines;

      const lines: string[] = [];
      const addLine = (line: string) => addTruncatedLine(lines, line, width);
      const question = currentQuestion();
      const options = currentOptions();

      addLine(theme.fg('accent', '─'.repeat(width)));

      if (hasSubmitTab) {
        addLine(` ${renderTabBar(questions, currentTab, answers, canSubmit(), theme)}`);
        lines.push('');
      }

      if (inputMode && question) {
        addLine(theme.fg('text', ` ${question.prompt}`));
        lines.push('');
        renderOptionsList(
          question,
          options,
          getQuestionAnswers(answers, question.id),
          optionIndex,
          inputMode,
          theme,
          addLine,
        );
        lines.push('');
        addLine(theme.fg('muted', ' Your answer:'));
        for (const line of editor.render(width - 2)) {
          addLine(` ${line}`);
        }
        lines.push('');
        addLine(theme.fg('dim', ' Enter to submit • Esc to cancel'));
      } else if (hasSubmitTab && currentTab === questions.length) {
        renderSubmitTab(questions, answers, canSubmit(), theme, addLine);
      } else if (question) {
        addLine(theme.fg('text', ` ${question.prompt}`));
        lines.push('');
        renderOptionsList(
          question,
          options,
          getQuestionAnswers(answers, question.id),
          optionIndex,
          false,
          theme,
          addLine,
        );
      }

      lines.push('');
      if (!inputMode) {
        addLine(theme.fg('dim', buildHelpText(question, hasSubmitTab)));
      }
      addLine(theme.fg('accent', '─'.repeat(width)));

      cachedLines = lines;
      return lines;
    }

    return {
      render,
      invalidate: () => {
        cachedLines = undefined;
      },
      handleInput,
    };
  });
}

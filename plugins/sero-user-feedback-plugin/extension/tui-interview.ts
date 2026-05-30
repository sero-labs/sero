/**
 * TUI renderer for the interview tool (Pi CLI interactive mode).
 *
 * Shows questions one at a time with a text editor for each response.
 * Navigate with Tab/Shift+Tab, submit answers with Enter, review
 * all answers before final submission.
 *
 * Only used when ctx.hasUI === true.
 */

import {
  Editor,
  type EditorTheme,
  Key,
  matchesKey,
  truncateToWidth
} from '@earendil-works/pi-tui';
import type { ExtensionUIContext, Theme } from '@earendil-works/pi-coding-agent';
import type { QuestionItem, QuestionAnswer } from '../shared/types';

interface InterviewResult {
  answers: QuestionAnswer[];
  cancelled: boolean;
}

export async function askInterviewTUI(
  ui: ExtensionUIContext,
  questions: QuestionItem[],
): Promise<InterviewResult> {
  return ui.custom<InterviewResult>((tui, theme, _kb, done) => {
    let currentStep = 0;
    let cachedLines: string[] | undefined;
    const answers = new Map<string, string>();

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

    function isReview() {
      return currentStep === questions.length;
    }

    function allAnswered() {
      return questions.every((q) => answers.has(q.id));
    }

    function submit(cancelled: boolean) {
      const result: QuestionAnswer[] = [];
      for (const q of questions) {
        const text = answers.get(q.id);
        if (text) {
          result.push({
            questionId: q.id,
            value: text,
            label: text,
            wasCustom: true,
          });
        }
      }
      done({ answers: result, cancelled });
    }

    /** Save whatever is in the editor for the current step. */
    function saveCurrentText() {
      const q = questions[currentStep];
      if (!q) return;
      const text = editor.getText().trim();
      if (text) {
        answers.set(q.id, text);
      }
    }

    /** Load existing answer (if any) into the editor for a step. */
    function loadEditorForStep() {
      const q = questions[currentStep];
      editor.setText(q ? answers.get(q.id) ?? '' : '');
    }

    editor.onSubmit = (value) => {
      const trimmed = value.trim();
      if (!trimmed) return;

      const q = questions[currentStep];
      if (!q) return;

      answers.set(q.id, trimmed);
      editor.setText('');

      // Advance to next unanswered question, or review
      if (currentStep < questions.length - 1) {
        currentStep++;
        loadEditorForStep();
      } else {
        currentStep = questions.length;
      }
      refresh();
    };

    function handleInput(data: string) {
      if (isReview()) {
        if (matchesKey(data, Key.enter) && allAnswered()) {
          submit(false);
        } else if (matchesKey(data, Key.escape)) {
          submit(true);
        } else if (
          matchesKey(data, Key.left) ||
          matchesKey(data, Key.up) ||
          matchesKey(data, Key.shift('tab'))
        ) {
          currentStep = questions.length - 1;
          loadEditorForStep();
          refresh();
        }
        return;
      }

      if (matchesKey(data, Key.escape)) {
        submit(true);
        return;
      }

      // Navigate between questions
      if (matchesKey(data, Key.tab)) {
        saveCurrentText();
        currentStep = Math.min(currentStep + 1, questions.length);
        loadEditorForStep();
        refresh();
        return;
      }
      if (matchesKey(data, Key.shift('tab'))) {
        saveCurrentText();
        currentStep = Math.max(0, currentStep - 1);
        loadEditorForStep();
        refresh();
        return;
      }

      // Everything else goes to the editor
      editor.handleInput(data);
      refresh();
    }

    function render(width: number): string[] {
      if (cachedLines) return cachedLines;

      const lines: string[] = [];
      const add = (s: string) => lines.push(truncateToWidth(s, width));

      add(theme.fg('accent', '─'.repeat(width)));

      // Progress indicator
      add(` ${renderProgress(questions, currentStep, answers, theme)}`);
      lines.push('');

      if (isReview()) {
        renderReview(questions, answers, allAnswered(), theme, add);
      } else {
        const q = questions[currentStep];
        if (q) {
          add(theme.fg('text', ` ${q.prompt}`));
          lines.push('');
          add(theme.fg('muted', ' Your answer:'));
          for (const line of editor.render(width - 2)) add(` ${line}`);
        }
      }

      lines.push('');
      const hint = isReview()
        ? ' Enter to submit • ←/Shift+Tab go back • Esc cancel'
        : ' Enter to answer • Tab next • Shift+Tab prev • Esc cancel';
      add(theme.fg('dim', hint));
      add(theme.fg('accent', '─'.repeat(width)));

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

// ── Render helpers ─────────────────────────────────────────────

function renderProgress(
  questions: QuestionItem[],
  currentStep: number,
  answers: Map<string, string>,
  theme: Theme,
): string {
  const parts: string[] = [];
  for (let i = 0; i < questions.length; i++) {
    const isActive = i === currentStep;
    const isAnswered = answers.has(questions[i].id);
    const dot = isAnswered ? '●' : '○';
    const color = isActive ? 'accent' : isAnswered ? 'success' : 'dim';
    parts.push(theme.fg(color, dot));
  }

  const atReview = currentStep === questions.length;
  const allDone = questions.every((q) => answers.has(q.id));
  parts.push(
    atReview
      ? theme.fg('accent', '✓')
      : theme.fg(allDone ? 'success' : 'dim', '✓'),
  );

  const label = atReview
    ? 'Review'
    : `Question ${currentStep + 1} of ${questions.length}`;

  return `${parts.join(' ')}  ${theme.fg('muted', label)}`;
}

function renderReview(
  questions: QuestionItem[],
  answers: Map<string, string>,
  canSubmit: boolean,
  theme: Theme,
  add: (s: string) => void,
) {
  add(theme.fg('accent', theme.bold(' Review your answers')));
  add('');

  for (const q of questions) {
    const answer = answers.get(q.id);
    add(theme.fg('muted', ` Q: ${q.prompt}`));
    if (answer) {
      add(theme.fg('text', ` A: ${answer}`));
    } else {
      add(theme.fg('warning', ' (not answered)'));
    }
    add('');
  }

  if (canSubmit) {
    add(theme.fg('success', ' All questions answered — press Enter to submit'));
  } else {
    const missing = questions.filter((q) => !answers.has(q.id)).length;
    add(
      theme.fg(
        'warning',
        ` ${missing} question${missing !== 1 ? 's' : ''} unanswered`,
      ),
    );
  }
}

import { truncateToWidth } from '@mariozechner/pi-tui';
import type { Theme } from '@mariozechner/pi-coding-agent';

import type { AnswerMap } from '../shared/questionnaire-flow';
import type { QuestionAnswer, QuestionItem, QuestionOption } from '../shared/types';

export interface RenderOption extends QuestionOption {
  isOther?: boolean;
}

export function buildHelpText(
  question: QuestionItem | undefined,
  hasSubmitTab: boolean,
): string {
  if (question?.multiSelect) {
    return hasSubmitTab
      ? ' Tab/←→ navigate • ↑↓ select • Enter/Space toggle • Esc cancel'
      : ' ↑↓ navigate • Enter/Space toggle • Esc cancel';
  }

  return hasSubmitTab
    ? ' Tab/←→ navigate • ↑↓ select • Enter confirm • Esc cancel'
    : ' ↑↓ navigate • Enter select • Esc cancel';
}

export function renderTabBar(
  questions: QuestionItem[],
  currentTab: number,
  answers: AnswerMap,
  canSubmit: boolean,
  theme: Theme,
): string {
  const parts: string[] = ['← '];
  for (let index = 0; index < questions.length; index++) {
    const isActive = index === currentTab;
    const isAnswered = (answers.get(questions[index].id)?.length ?? 0) > 0;
    const label = questions[index].label;
    const box = isAnswered ? '■' : '□';
    const color = isAnswered ? 'success' : 'muted';
    const text = ` ${box} ${label} `;
    parts.push(
      isActive
        ? theme.bg('selectedBg', theme.fg('text', text))
        : theme.fg(color, text),
    );
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

export function renderOptionsList(
  question: QuestionItem,
  options: RenderOption[],
  answers: QuestionAnswer[],
  selectedIndex: number,
  inputMode: boolean,
  theme: Theme,
  addLine: (line: string) => void,
) {
  const customAnswer = answers.find((answer) => answer.wasCustom);

  if (question.multiSelect) {
    addLine(
      theme.fg(
        'muted',
        ' Select one or more options, then move to Submit when ready.',
      ),
    );
    addLine('');
  }

  for (let index = 0; index < options.length; index++) {
    const option = options[index];
    const isSelected = index === selectedIndex;
    const isChecked = answers.some(
      (answer) => !answer.wasCustom && answer.value === option.value,
    );
    const prefix = isSelected ? theme.fg('accent', '> ') : '  ';
    const color = isSelected ? 'accent' : 'text';
    const marker = question.multiSelect
      ? `${isChecked ? '☑' : '☐'} ${option.label}`
      : `${index + 1}. ${option.label}`;

    if (option.isOther && inputMode) {
      addLine(prefix + theme.fg('accent', `${marker} ✎`));
    } else {
      addLine(prefix + theme.fg(color, marker));
    }
    if (option.description) {
      addLine(`     ${theme.fg('muted', option.description)}`);
    }
  }

  if (customAnswer) {
    addLine('');
    addLine(`  ${theme.fg('success', `✎ Custom: ${customAnswer.label}`)}`);
  }
}

export function renderSubmitTab(
  questions: QuestionItem[],
  answers: AnswerMap,
  canSubmit: boolean,
  theme: Theme,
  addLine: (line: string) => void,
) {
  addLine(theme.fg('accent', theme.bold(' Ready to submit')));
  addLine('');

  for (const question of questions) {
    const questionAnswers = answers.get(question.id) ?? [];
    if (questionAnswers.length > 0) {
      const formatted = questionAnswers.map((answer) => {
        if (answer.wasCustom) return `(wrote) ${answer.label}`;
        return answer.index ? `${answer.index}. ${answer.label}` : answer.label;
      });
      addLine(
        `${theme.fg('muted', ` ${question.label}: `)}${theme.fg('text', formatted.join(', '))}`,
      );
      continue;
    }

    addLine(
      `${theme.fg('muted', ` ${question.label}: `)}${theme.fg('warning', 'Skipped')}`,
    );
  }

  addLine('');
  if (canSubmit) {
    addLine(theme.fg('success', ' Press Enter to submit'));
    return;
  }

  const missing = questions
    .filter((question) => (answers.get(question.id)?.length ?? 0) === 0)
    .map((question) => question.label)
    .join(', ');
  addLine(theme.fg('warning', ` Unanswered: ${missing}`));
}

export function addTruncatedLine(
  lines: string[],
  line: string,
  width: number,
) {
  lines.push(truncateToWidth(line, width));
}

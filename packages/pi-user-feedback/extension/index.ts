/**
 * User Feedback Pi Extension.
 *
 * Registers three tools + one command:
 *   - `question` — ask a single question with options
 *   - `questionnaire` — ask multiple questions (tab-based in TUI, app UI in Sero)
 *   - `interview` — open-ended iterative questions for deep-dive understanding
 *   - `/interview <path>` — command that starts an interview → spec workflow
 *
 * Dual-mode: uses IPC bridge when Sero is active (detected via event bus
 * listeners), otherwise falls back to TUI rendering in Pi CLI.
 */

import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { Text } from '@mariozechner/pi-tui';
import { Type } from '@sinclair/typebox';

import type { QuestionItem, QuestionAnswer } from '../shared/types';
import { nextQuestionId, askQuestion, hasSeroIPCBridge } from './ipc-bridge';
import { askQuestionTUI } from './tui-question';
import { askQuestionnaireTUI } from './tui-questionnaire';
import { registerInterviewTool, registerInterviewCommand } from './interview-tool';
import { registerPermissionGate } from './permission-gate';

// ── Schemas ────────────────────────────────────────────────────

const OptionSchema = Type.Object({
  label: Type.String({ description: 'Display label for the option' }),
  value: Type.Optional(Type.String({ description: 'Value returned when selected (defaults to label)' })),
  description: Type.Optional(Type.String({ description: 'Optional description shown below label' })),
});

const QuestionParams = Type.Object({
  question: Type.String({ description: 'The question to ask the user' }),
  options: Type.Array(OptionSchema, { description: 'Options for the user to choose from' }),
});

const QuestionnaireQuestionSchema = Type.Object({
  id: Type.String({ description: 'Unique identifier for this question' }),
  label: Type.Optional(Type.String({ description: 'Short label for tab/step (defaults to Q1, Q2)' })),
  prompt: Type.String({ description: 'The full question text to display' }),
  options: Type.Array(OptionSchema, { description: 'Available options' }),
  allowOther: Type.Optional(Type.Boolean({ description: 'Allow custom text input (default: true)' })),
});

const QuestionnaireParams = Type.Object({
  questions: Type.Array(QuestionnaireQuestionSchema, { description: 'Questions to ask' }),
});

// ── Extension entry point ──────────────────────────────────────

export default function userFeedback(pi: ExtensionAPI) {
  registerQuestionTool(pi);
  registerQuestionnaireTool(pi);
  registerInterviewTool(pi);
  registerInterviewCommand(pi);
  registerPermissionGate(pi);
}

// ── Question tool ──────────────────────────────────────────────

function registerQuestionTool(pi: ExtensionAPI) {
  pi.registerTool({
    name: 'question',
    label: 'Question',
    description:
      'Ask the user a question and let them pick from options or type a custom answer. ' +
      'Use when you need user input to proceed.',
    parameters: QuestionParams,

    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      if (params.options.length === 0) {
        return {
          content: [{ type: 'text', text: 'Error: No options provided' }],
          details: { question: params.question, options: [], answer: null },
        };
      }

      const questionItem: QuestionItem = {
        id: 'q0',
        label: 'Question',
        prompt: params.question,
        options: params.options.map((o) => ({
          value: o.value ?? o.label,
          label: o.label,
          description: o.description,
        })),
        allowOther: true,
      };

      // ── Sero mode: IPC bridge ──────────────────────────────
      if (hasSeroIPCBridge()) {
        const id = nextQuestionId();
        const response = await askQuestion(
          {
            id,
            type: 'question',
            toolCallId: _toolCallId,
            questions: [questionItem],
            timestamp: new Date().toISOString(),
          },
          signal,
        );

        if (response.cancelled || response.answers.length === 0) {
          return {
            content: [{ type: 'text', text: 'User cancelled the selection' }],
            details: { question: params.question, options: questionItem.options.map((o) => o.label), answer: null },
          };
        }

        return buildQuestionResult(params.question, questionItem.options, response.answers[0]);
      }

      // ── Pi CLI mode: TUI ───────────────────────────────────
      if (ctx.hasUI) {
        const answer = await askQuestionTUI(ctx.ui, questionItem);
        return buildQuestionResult(params.question, questionItem.options, answer);
      }

      // Non-interactive — no way to ask
      return {
        content: [{ type: 'text', text: 'Error: No UI available to ask the user' }],
        details: { question: params.question, options: questionItem.options.map((o) => o.label), answer: null },
      };
    },

    renderCall(args, theme) {
      let text = theme.fg('toolTitle', theme.bold('question ')) + theme.fg('muted', args.question);
      const opts = Array.isArray(args.options) ? args.options : [];
      if (opts.length) {
        const labels = opts.map((o: { label: string }) => o.label);
        const numbered = [...labels, 'Type something.'].map((o, i) => `${i + 1}. ${o}`);
        text += `\n${theme.fg('dim', `  Options: ${numbered.join(', ')}`)}`;
      }
      return new Text(text, 0, 0);
    },

    renderResult(result, _options, theme) {
      const details = result.details as { answer: string | null; wasCustom?: boolean; options?: string[] } | undefined;
      if (!details || details.answer === null) {
        return new Text(theme.fg('warning', 'Cancelled'), 0, 0);
      }
      if (details.wasCustom) {
        return new Text(
          theme.fg('success', '✓ ') + theme.fg('muted', '(wrote) ') + theme.fg('accent', details.answer),
          0, 0,
        );
      }
      const idx = details.options?.indexOf(details.answer);
      const display = idx !== undefined && idx >= 0 ? `${idx + 1}. ${details.answer}` : details.answer;
      return new Text(theme.fg('success', '✓ ') + theme.fg('accent', display), 0, 0);
    },
  });
}

// ── Questionnaire tool ─────────────────────────────────────────

function registerQuestionnaireTool(pi: ExtensionAPI) {
  pi.registerTool({
    name: 'questionnaire',
    label: 'Questionnaire',
    description:
      'Ask the user one or more questions. Use for clarifying requirements, ' +
      'getting preferences, or confirming decisions. Single questions show a ' +
      'simple list; multiple questions show a step-based form.',
    parameters: QuestionnaireParams,

    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      if (params.questions.length === 0) {
        return {
          content: [{ type: 'text', text: 'Error: No questions provided' }],
          details: { questions: [], answers: [], cancelled: true },
        };
      }

      const questions: QuestionItem[] = params.questions.map((q, i) => ({
        id: q.id,
        label: q.label || `Q${i + 1}`,
        prompt: q.prompt,
        options: q.options.map((o) => ({
          value: o.value ?? o.label,
          label: o.label,
          description: o.description,
        })),
        allowOther: q.allowOther !== false,
      }));

      // ── Sero mode: IPC bridge ──────────────────────────────
      if (hasSeroIPCBridge()) {
        const id = nextQuestionId();
        const response = await askQuestion(
          {
            id,
            type: 'questionnaire',
            toolCallId: _toolCallId,
            questions,
            timestamp: new Date().toISOString(),
          },
          signal,
        );

        return buildQuestionnaireResult(questions, response.answers, response.cancelled);
      }

      // ── Pi CLI mode: TUI ───────────────────────────────────
      if (ctx.hasUI) {
        const result = await askQuestionnaireTUI(ctx.ui, questions);
        return buildQuestionnaireResult(questions, result.answers, result.cancelled);
      }

      // Non-interactive — no way to ask
      return {
        content: [{ type: 'text', text: 'Error: No UI available to ask the user' }],
        details: { questions, answers: [], cancelled: true },
      };
    },

    renderCall(args, theme) {
      const qs = (args.questions as QuestionItem[]) || [];
      const count = qs.length;
      const labels = qs.map((q) => q.label || q.id).join(', ');
      let text = theme.fg('toolTitle', theme.bold('questionnaire '));
      text += theme.fg('muted', `${count} question${count !== 1 ? 's' : ''}`);
      if (labels) text += theme.fg('dim', ` (${labels})`);
      return new Text(text, 0, 0);
    },

    renderResult(result, _options, theme) {
      const details = result.details as { cancelled?: boolean; answers?: QuestionAnswer[] } | undefined;
      if (!details || details.cancelled) {
        return new Text(theme.fg('warning', 'Cancelled'), 0, 0);
      }
      const lines = (details.answers ?? []).map((a) => {
        if (a.wasCustom) {
          return `${theme.fg('success', '✓ ')}${theme.fg('accent', a.questionId)}: ${theme.fg('muted', '(wrote) ')}${a.label}`;
        }
        const display = a.index ? `${a.index}. ${a.label}` : a.label;
        return `${theme.fg('success', '✓ ')}${theme.fg('accent', a.questionId)}: ${display}`;
      });
      return new Text(lines.join('\n'), 0, 0);
    },
  });
}

// ── Result builders ────────────────────────────────────────────

function buildQuestionResult(
  question: string,
  options: { value: string; label: string }[],
  answer: QuestionAnswer | null | undefined,
) {
  const optLabels = options.map((o) => o.label);

  if (!answer) {
    return {
      content: [{ type: 'text' as const, text: 'User cancelled the selection' }],
      details: { question, options: optLabels, answer: null },
    };
  }

  if (answer.wasCustom) {
    return {
      content: [{ type: 'text' as const, text: `User wrote: ${answer.label}` }],
      details: { question, options: optLabels, answer: answer.label, wasCustom: true },
    };
  }

  return {
    content: [{ type: 'text' as const, text: `User selected: ${answer.index ?? ''}. ${answer.label}` }],
    details: { question, options: optLabels, answer: answer.label, wasCustom: false },
  };
}

function buildQuestionnaireResult(
  questions: QuestionItem[],
  answers: QuestionAnswer[],
  cancelled: boolean,
) {
  if (cancelled) {
    return {
      content: [{ type: 'text' as const, text: 'User cancelled the questionnaire' }],
      details: { questions, answers: [], cancelled: true },
    };
  }

  const answerLines = answers.map((a) => {
    const qLabel = questions.find((q) => q.id === a.questionId)?.label || a.questionId;
    return a.wasCustom
      ? `${qLabel}: user wrote: ${a.label}`
      : `${qLabel}: user selected: ${a.index}. ${a.label}`;
  });

  return {
    content: [{ type: 'text' as const, text: answerLines.join('\n') }],
    details: { questions, answers, cancelled: false },
  };
}

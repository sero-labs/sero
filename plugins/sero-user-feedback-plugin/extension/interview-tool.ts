/**
 * Interview tool — open-ended, iterative question sessions.
 *
 * Unlike the questionnaire (predefined options), interview questions are
 * pure free-text. The agent calls this tool in rounds, processing answers
 * and sending deeper follow-ups until it has enough context.
 *
 * Also registers a `/interview <output-path>` command that injects a
 * prompt template to drive the full interview→spec workflow.
 */

import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { Text } from '@mariozechner/pi-tui';
import { Type } from 'typebox';

import type { QuestionItem, QuestionAnswer } from '../shared/types';
import { nextQuestionId, askQuestion, hasSeroIPCBridge } from './ipc-bridge';
import { askInterviewTUI } from './tui-interview';

// ── Schema ─────────────────────────────────────────────────────

const InterviewQuestionSchema = Type.Object({
  id: Type.String({ description: 'Unique identifier for this question' }),
  prompt: Type.String({ description: 'The interview question to ask the user' }),
});

const InterviewParams = Type.Object({
  questions: Type.Array(InterviewQuestionSchema, {
    description: 'Open-ended interview questions. Each gets a free-text response.',
    minItems: 1,
  }),
});

// ── Tool registration ──────────────────────────────────────────

export function registerInterviewTool(pi: ExtensionAPI) {
  pi.registerTool({
    name: 'interview',
    label: 'Interview',
    description:
      'Ask the user open-ended interview questions to deeply understand a problem, ' +
      'requirement, or design decision. Each question gets a free-text response — ' +
      'there are no predefined options.\n\n' +
      'Use iteratively: call with a batch of 3–5 questions, process the answers, ' +
      'then call again with deeper follow-ups. Continue until you have thorough ' +
      'understanding. Questions should be thoughtful and non-obvious — probe for ' +
      'edge cases, tradeoffs, constraints, and unstated assumptions.',
    parameters: InterviewParams,

    async execute(_toolCallId, params, signal, _onUpdate, ctx) {

      if (params.questions.length === 0) {
        return {
          content: [{ type: 'text', text: 'Error: No questions provided' }],
          details: { questions: [], answers: [], cancelled: true },
        };
      }

      const questions: QuestionItem[] = params.questions.map((q, i) => ({
        id: q.id,
        label: `Q${i + 1}`,
        prompt: q.prompt,
        options: [],
        allowOther: true,
      }));

      // ── Sero mode: IPC bridge (must check first) ───────────
      if (hasSeroIPCBridge()) {
        const id = nextQuestionId();
        const response = await askQuestion(
          {
            id,
            type: 'interview',
            toolCallId: _toolCallId,
            questions,
            timestamp: new Date().toISOString(),
          },
          signal,
        );

        return buildInterviewResult(questions, response.answers, response.cancelled);
      }

      // ── Pi CLI mode: TUI ───────────────────────────────────
      if (ctx.hasUI) {
        const result = await askInterviewTUI(ctx.ui, questions);
        return buildInterviewResult(questions, result.answers, result.cancelled);
      }

      // Non-interactive — no way to ask
      return {
        content: [{ type: 'text' as const, text: 'Error: No UI available to ask the user' }],
        details: { questions, answers: [], cancelled: true },
      };
    },

    renderCall(args, theme) {
      const qs = (args.questions as { id: string; prompt: string }[]) || [];
      const count = qs.length;
      let text = theme.fg('toolTitle', theme.bold('interview '));
      text += theme.fg('muted', `${count} question${count !== 1 ? 's' : ''}`);
      if (count > 0 && count <= 5) {
        const previews = qs.map((q) =>
          q.prompt.length > 60 ? q.prompt.slice(0, 57) + '…' : q.prompt,
        );
        text += '\n' + previews.map((p) => theme.fg('dim', `  • ${p}`)).join('\n');
      }
      return new Text(text, 0, 0);
    },

    renderResult(result, _options, theme) {
      const details = result.details as
        | { cancelled?: boolean; answers?: QuestionAnswer[] }
        | undefined;
      if (!details || details.cancelled) {
        return new Text(theme.fg('warning', 'Interview cancelled'), 0, 0);
      }
      const answers = details.answers ?? [];
      const lines = answers.map((a) => {
        const preview = a.label.length > 80 ? a.label.slice(0, 77) + '…' : a.label;
        return `${theme.fg('success', '✓ ')}${theme.fg('accent', a.questionId)}: ${preview}`;
      });
      return new Text(
        theme.fg('muted', `${answers.length} answer${answers.length !== 1 ? 's' : ''}`) +
          '\n' +
          lines.join('\n'),
        0,
        0,
      );
    },
  });
}

// ── Command registration ───────────────────────────────────────

export function registerInterviewCommand(pi: ExtensionAPI) {
  pi.registerCommand('interview', {
    description: 'Start an in-depth interview and write a spec to the given path',

    handler: async (args, _ctx) => {
      const outputPath = args.trim();
      if (!outputPath) {
        _ctx.ui.notify('Usage: /interview <output-path>', 'warning');
        return;
      }

      const prompt = [
        'Interview me in detail using the interview tool about literally anything: ',
        'technical implementation, UI & UX, concerns, tradeoffs, etc. ',
        'but make sure the questions are not obvious.',
        '',
        'Be very in-depth and continue interviewing me continually until ',
        `it's complete, then write the spec back to \`${outputPath}\``,
      ].join('\n');

      pi.sendUserMessage(prompt);
    },
  });
}

// ── Result builder ─────────────────────────────────────────────

export function buildInterviewResult(
  questions: QuestionItem[],
  answers: QuestionAnswer[],
  cancelled: boolean,
) {
  if (cancelled) {
    return {
      content: [{ type: 'text' as const, text: 'User cancelled the interview' }],
      details: { questions, answers: [], cancelled: true },
    };
  }

  const lines = answers.map((a) => {
    const qPrompt =
      questions.find((q) => q.id === a.questionId)?.prompt || a.questionId;
    return `Q: ${qPrompt}\nA: ${a.label}`;
  });

  return {
    content: [{ type: 'text' as const, text: lines.join('\n\n') }],
    details: { questions, answers, cancelled: false },
  };
}

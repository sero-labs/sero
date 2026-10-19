/**
 * question, questionnaire and interview block until a user answers.
 *
 * The app sends each one to the renderer over `window.sero.userFeedback` and waits for
 * `window.sero.userFeedback.answer()`. A step's `setup` arms a listener in the app window that
 * plays the user: it answers the one request whose first prompt matches, and keeps what the
 * renderer was sent so `expect` can compare it with what the tool asked for.
 */
import type { StepContext, ToolProbe } from '../types';
import { expectText } from '../expect';
import { pageOf } from '../files';

/** What one answer says. A `label` that is not one of the question's options is typed text. */
interface PlannedAnswer {
  questionId: string;
  label: string;
}

/** The user's reply to a request: cancel it, or answer these questions. */
type Reply = { cancel: true } | { cancel?: false; answers: PlannedAnswer[] };

interface SeenRequest {
  type: string;
  prompts: string[];
  /** Option labels per question id, as the renderer received them. */
  options: Record<string, string[]>;
}

declare global {
  interface Window {
    __toolCheckFeedback?: Record<string, SeenRequest>;
  }
}

/** Plays the user for the next request of this type whose first prompt is `prompt`. */
async function armReply(ctx: StepContext, key: string, type: string, prompt: string, reply: Reply): Promise<void> {
  await pageOf(ctx).evaluate(({ key: slot, type: wantedType, prompt: wantedPrompt, reply: plan }) => {
    const seen = (window.__toolCheckFeedback ??= {});
    const stop = window.sero.userFeedback.onQuestion((request) => {
      // The permission gate and the host's own cards use the same channel.
      if (request.type !== wantedType || request.questions[0]?.prompt !== wantedPrompt) return;
      stop();
      const options: Record<string, string[]> = {};
      for (const question of request.questions) options[question.id] = question.options.map((option) => option.label);
      seen[slot] = { type: request.type, prompts: request.questions.map((question) => question.prompt), options };
      const answers = (plan.cancel ? [] : plan.answers).map((planned) => {
        const question = request.questions.find((candidate) => candidate.id === planned.questionId);
        const index = question?.options.findIndex((option) => option.label === planned.label) ?? -1;
        const option = index >= 0 ? question?.options[index] : undefined;
        return option
          ? { questionId: planned.questionId, value: option.value, label: option.label, wasCustom: false, index: index + 1 }
          : { questionId: planned.questionId, value: planned.label, label: planned.label, wasCustom: true };
      });
      void window.sero.userFeedback.answer({ id: request.id, answers, cancelled: plan.cancel === true });
    });
  }, { key, type, prompt, reply });
}

/** What the renderer received for this step, and the proof that no request is left waiting. */
async function expectRequest(ctx: StepContext, key: string, shape: SeenRequest): Promise<void> {
  const page = pageOf(ctx);
  const seen = await page.evaluate((slot) => window.__toolCheckFeedback?.[slot], key);
  if (!seen) throw new Error('the app never sent the request to the renderer');
  if (JSON.stringify(seen) !== JSON.stringify(shape)) {
    throw new Error(`the renderer received ${JSON.stringify(seen)}, expected ${JSON.stringify(shape)}`);
  }
  const pending = await page.evaluate(() => window.sero.userFeedback.getPending());
  if (pending.some((request) => request.questions[0]?.prompt === shape.prompts[0])) throw new Error('the request is still pending after the answer');
}

const QUESTION = 'tc-question which colour?';
const QUESTION_OPTIONS = [{ label: 'Red' }, { label: 'Blue', description: 'the cool one' }, { label: 'Green' }];
const questionShape = (prompt: string): SeenRequest => ({ type: 'question', prompts: [prompt], options: { q0: ['Red', 'Blue', 'Green'] } });

export const questionProbe: ToolProbe = {
  tool: 'question',
  steps: [
    {
      action: null,
      setup: (ctx) => armReply(ctx, 'question-select', 'question', QUESTION, { answers: [{ questionId: 'q0', label: 'Blue' }] }),
      params: { question: QUESTION, options: QUESTION_OPTIONS },
      async expect(result, ctx) {
        expectText(result, 'User selected: 2. Blue');
        await expectRequest(ctx, 'question-select', questionShape(QUESTION));
      },
    },
    {
      action: null,
      setup: (ctx) => armReply(ctx, 'question-custom', 'question', `${QUESTION} again`, { answers: [{ questionId: 'q0', label: 'tc custom colour' }] }),
      params: { question: `${QUESTION} again`, options: QUESTION_OPTIONS },
      async expect(result, ctx) {
        expectText(result, 'User wrote: tc custom colour');
        await expectRequest(ctx, 'question-custom', questionShape(`${QUESTION} again`));
      },
    },
    {
      action: null,
      setup: (ctx) => armReply(ctx, 'question-cancel', 'question', `${QUESTION} cancelled`, { cancel: true }),
      params: { question: `${QUESTION} cancelled`, options: QUESTION_OPTIONS },
      async expect(result, ctx) {
        expectText(result, 'User cancelled the selection');
        await expectRequest(ctx, 'question-cancel', questionShape(`${QUESTION} cancelled`));
      },
    },
  ],
};

const FORM_COLOUR = 'tc-questionnaire which colour?';
const FORM_NOTE = 'tc-questionnaire anything to add?';
const formQuestions = (colour: string) => [
  { id: 'tc-colour', label: 'Colour', prompt: colour, options: [{ label: 'Red' }, { label: 'Green' }] },
  { id: 'tc-note', label: 'Note', prompt: FORM_NOTE, options: [] },
];
const formShape = (colour: string): SeenRequest => ({
  type: 'questionnaire',
  prompts: [colour, FORM_NOTE],
  options: { 'tc-colour': ['Red', 'Green'], 'tc-note': [] },
});

export const questionnaireProbe: ToolProbe = {
  tool: 'questionnaire',
  steps: [
    {
      action: null,
      setup: (ctx) => armReply(ctx, 'questionnaire-answer', 'questionnaire', FORM_COLOUR, {
        answers: [{ questionId: 'tc-colour', label: 'Green' }, { questionId: 'tc-note', label: 'tc typed note' }],
      }),
      params: { questions: formQuestions(FORM_COLOUR) },
      async expect(result, ctx) {
        expectText(result, 'Colour: user selected: 2. Green\nNote: user wrote: tc typed note');
        if (result.text.includes('skipped by user')) throw new Error(`an answered question was reported as skipped: ${result.text}`);
        await expectRequest(ctx, 'questionnaire-answer', formShape(FORM_COLOUR));
      },
    },
    {
      action: null,
      setup: (ctx) => armReply(ctx, 'questionnaire-cancel', 'questionnaire', `${FORM_COLOUR} cancelled`, { cancel: true }),
      params: { questions: formQuestions(`${FORM_COLOUR} cancelled`) },
      async expect(result, ctx) {
        expectText(result, 'User cancelled the questionnaire');
        await expectRequest(ctx, 'questionnaire-cancel', formShape(`${FORM_COLOUR} cancelled`));
      },
    },
  ],
};

const INTERVIEW_FIRST = 'tc-interview what are you building?';
const INTERVIEW_SECOND = 'tc-interview what could go wrong?';
const interviewQuestions = (first: string) => [{ id: 'tc-first', prompt: first }, { id: 'tc-second', prompt: INTERVIEW_SECOND }];
const interviewShape = (first: string): SeenRequest => ({
  type: 'interview',
  prompts: [first, INTERVIEW_SECOND],
  options: { 'tc-first': [], 'tc-second': [] },
});

export const interviewProbe: ToolProbe = {
  tool: 'interview',
  steps: [
    {
      action: null,
      setup: (ctx) => armReply(ctx, 'interview-answer', 'interview', INTERVIEW_FIRST, {
        answers: [{ questionId: 'tc-first', label: 'a tool check' }, { questionId: 'tc-second', label: 'nothing at all' }],
      }),
      params: { questions: interviewQuestions(INTERVIEW_FIRST) },
      async expect(result, ctx) {
        expectText(result, `Q: ${INTERVIEW_FIRST}\nA: a tool check\n\nQ: ${INTERVIEW_SECOND}\nA: nothing at all`);
        await expectRequest(ctx, 'interview-answer', interviewShape(INTERVIEW_FIRST));
      },
    },
    {
      action: null,
      setup: (ctx) => armReply(ctx, 'interview-cancel', 'interview', `${INTERVIEW_FIRST} cancelled`, { cancel: true }),
      params: { questions: interviewQuestions(`${INTERVIEW_FIRST} cancelled`) },
      async expect(result, ctx) {
        expectText(result, 'User cancelled the interview');
        await expectRequest(ctx, 'interview-cancel', interviewShape(`${INTERVIEW_FIRST} cancelled`));
      },
    },
  ],
};

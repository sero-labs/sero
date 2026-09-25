import { EventEmitter } from 'node:events';
import {
  getGlobalSingleton,
  getUserFeedbackAnswerEvent,
  USER_FEEDBACK_BUS_KEY,
  USER_FEEDBACK_QUESTION_REQUEST_EVENT,
  type UserFeedbackPendingQuestion,
} from '@sero-ai/common';
import { afterEach, describe, expect, it } from 'vitest';
import { chooseAppPermissions, type AppPermissionChoices } from '../viewer/app-permissions';

const bus = getGlobalSingleton(USER_FEEDBACK_BUS_KEY, () => new EventEmitter());
const cleanups: Array<() => void> = [];

afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
});

/** A fake question UI: answers each question with the next value, or cancels for null. */
function answerWith(...values: Array<string | null>) {
  const asked: UserFeedbackPendingQuestion[] = [];
  const listener = (question: UserFeedbackPendingQuestion) => {
    asked.push(question);
    const value = values.shift();
    setImmediate(() => bus.emit(getUserFeedbackAnswerEvent(question.id), value === null || value === undefined
      ? { id: question.id, cancelled: true, answers: [] }
      : { id: question.id, cancelled: false, answers: [{ questionId: 'app-permissions', value, label: value, wasCustom: false }] }));
  };
  bus.on(USER_FEEDBACK_QUESTION_REQUEST_EVENT, listener);
  cleanups.push(() => bus.off(USER_FEEDBACK_QUESTION_REQUEST_EVENT, listener));
  return asked;
}

const requested = { clipboardWrite: {}, geolocation: {} };
const options = (choices: AppPermissionChoices) => ({ appKey: 'sales\nui://sales/dashboard', appLabel: 'sales · show_dashboard app', choices });

describe('MCP app permissions', () => {
  it('asks once per app, grants what Sero can grant, and keeps the choice', async () => {
    const asked = answerWith('allow');
    const choices: AppPermissionChoices = new Map();

    const first = await chooseAppPermissions(requested, options(choices));
    const second = await chooseAppPermissions(requested, options(choices));

    expect(first).toEqual({ clipboardWrite: {} });
    expect(second).toEqual({ clipboardWrite: {} });
    expect(asked).toHaveLength(1);
    expect(asked[0]?.context?.source).toBe('sales · show_dashboard app');
    expect(asked[0]?.questions[0]?.label).toBe('Allow the app to write to your clipboard?');
    expect(asked[0]?.questions[0]?.options.map((option) => option.label)).toEqual(['Deny', 'Allow']);
  });

  it('grants nothing when the user cancels, and asks again next time', async () => {
    const asked = answerWith(null, 'deny');
    const choices: AppPermissionChoices = new Map();

    expect(await chooseAppPermissions(requested, options(choices))).toEqual({});
    expect(await chooseAppPermissions(requested, options(choices))).toEqual({});
    expect(asked).toHaveLength(2);
  });

  it('grants nothing without a question when nobody can answer', async () => {
    expect(await chooseAppPermissions(requested, options(new Map()))).toEqual({});
  });

  it('does not ask for a permission that Sero cannot grant', async () => {
    const asked = answerWith('allow');

    expect(await chooseAppPermissions({ geolocation: {} }, options(new Map()))).toEqual({});
    expect(asked).toHaveLength(0);
  });
});

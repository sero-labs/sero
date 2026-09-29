import type { ExtensionUIContext } from '@earendil-works/pi-coding-agent';
import { describe, expect, it } from 'vitest';

import { askQuestionnaireTUI } from '../tui-questionnaire';
import type { QuestionItem } from '../../shared/types';

describe('TUI questionnaire', () => {
  it('requires an explicit skip before submitting partial answers', async () => {
    let handleInput: (data: string) => void = () => {};
    const submitted: unknown[] = [];
    const ui = {
      custom: (factory: (
        tui: unknown,
        theme: unknown,
        keybindings: unknown,
        done: (result: unknown) => void,
      ) => { handleInput: (data: string) => void }) => new Promise((resolve) => {
        const component = factory(
          { requestRender: () => {} },
          { fg: (_color: string, text: string) => text, bg: (_color: string, text: string) => text, bold: (text: string) => text },
          undefined,
          (result) => { submitted.push(result); resolve(result); },
        );
        handleInput = component.handleInput;
      }),
    } as unknown as ExtensionUIContext;
    const questions: QuestionItem[] = [
      { id: 'one', label: 'One', prompt: 'First?', options: [{ value: 'yes', label: 'Yes' }], allowOther: false },
      { id: 'two', label: 'Two', prompt: 'Second?', options: [{ value: 'no', label: 'No' }], allowOther: false },
    ];

    const resultPromise = askQuestionnaireTUI(ui, questions);

    handleInput('\r');
    handleInput('\t');
    handleInput('\r');
    expect(submitted).toEqual([]);

    handleInput('\u001b[Z');
    handleInput('s');
    handleInput('\r');

    const result = await resultPromise;
    expect(result.cancelled).toBe(false);
    expect(result.answers.map((answer) => answer.questionId)).toEqual(['one']);
  });
});

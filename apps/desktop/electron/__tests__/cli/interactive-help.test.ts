/**
 * Interactive tool help text tests.
 *
 * Verifies that the schema bridge auto-generates rich help for tools
 * with nested JSON parameters (question, questionnaire, interview).
 * The help is generated from the TypeBox schemas defined in the
 * sero-user-feedback-plugin — no manual overrides needed.
 */

import { describe, it, expect } from 'vitest';
import { Type } from 'typebox';
import { bridgeTool } from '@electron/cli/core/schema-bridge';

// ── Replicate the schemas from sero-user-feedback-plugin ────

const OptionSchema = Type.Object({
  label: Type.String({ description: 'Display label for the option' }),
  value: Type.Optional(Type.String({ description: 'Value returned when selected (defaults to label)' })),
  description: Type.Optional(Type.String({ description: 'Optional description shown below label' })),
  exclusive: Type.Optional(Type.Boolean({ description: 'In multi-select mode, this option clears other selections' })),
});

const QuestionParams = Type.Object({
  question: Type.String({ description: 'The question to ask the user' }),
  options: Type.Array(OptionSchema, { description: 'Options for the user to choose from' }),
});

const QuestionnaireQuestionSchema = Type.Object({
  id: Type.String({ description: 'Unique identifier for this question' }),
  label: Type.Optional(Type.String({ description: 'Short label for tab/step' })),
  prompt: Type.String({ description: 'The full question text to display' }),
  options: Type.Array(OptionSchema, { description: 'Available options' }),
  allowOther: Type.Optional(Type.Boolean({ description: 'Allow custom text input (default: true)' })),
  multiSelect: Type.Optional(Type.Boolean({ description: 'Allow selecting multiple options' })),
});

const QuestionnaireParams = Type.Object({
  questions: Type.Array(QuestionnaireQuestionSchema, { description: 'Questions to ask' }),
});

const InterviewQuestionSchema = Type.Object({
  id: Type.String({ description: 'Unique identifier for this question' }),
  prompt: Type.String({ description: 'The interview question to ask the user' }),
});

const InterviewParams = Type.Object({
  questions: Type.Array(InterviewQuestionSchema, { description: 'Open-ended interview questions' }),
});

const noop = async () => ({ content: [{ type: 'text' as const, text: 'ok' }], details: undefined });

// ── Tests ───────────────────────────────────────────────────

describe('Schema bridge auto-generated help for nested params', () => {
  describe('question', () => {
    const cmd = bridgeTool('question', {
      name: 'question', label: 'Question',
      description: 'Ask the user a question with selectable options.',
      parameters: QuestionParams, execute: noop,
    });

    it('documents the options JSON shape with field descriptions', () => {
      expect(cmd.help).toContain('JSON shape for options');
      expect(cmd.help).toContain('label (required, string)');
      expect(cmd.help).toContain('value (optional, string)');
      expect(cmd.help).toContain('description (optional, string)');
      expect(cmd.help).toContain('exclusive (optional, boolean)');
    });

    it('includes a JSON example for options', () => {
      expect(cmd.help).toContain('Example options:');
      expect(cmd.help).toMatch(/"label"/);
    });
  });

  describe('questionnaire', () => {
    const cmd = bridgeTool('questionnaire', {
      name: 'questionnaire', label: 'Questionnaire',
      description: 'Ask the user one or more questions in a step-based form.',
      parameters: QuestionnaireParams, execute: noop,
    });

    it('documents the questions JSON shape', () => {
      expect(cmd.help).toContain('JSON shape for questions');
      expect(cmd.help).toContain('id (required, string)');
      expect(cmd.help).toContain('prompt (required, string)');
      expect(cmd.help).toContain('options (required, array)');
      expect(cmd.help).toContain('allowOther (optional, boolean)');
      expect(cmd.help).toContain('multiSelect (optional, boolean)');
    });

    it('documents nested option fields within questions', () => {
      expect(cmd.help).toContain('JSON shape for options (nested');
      expect(cmd.help).toContain('label (required, string)');
    });

    it('includes a JSON example for questions', () => {
      expect(cmd.help).toContain('Example questions:');
      expect(cmd.help).toMatch(/"id"/);
      expect(cmd.help).toMatch(/"prompt"/);
    });
  });

  describe('interview', () => {
    const cmd = bridgeTool('interview', {
      name: 'interview', label: 'Interview',
      description: 'Ask open-ended interview questions with free-text responses.',
      parameters: InterviewParams, execute: noop,
    });

    it('documents the questions JSON shape', () => {
      expect(cmd.help).toContain('JSON shape for questions');
      expect(cmd.help).toContain('id (required, string)');
      expect(cmd.help).toContain('prompt (required, string)');
    });

    it('includes a JSON example', () => {
      expect(cmd.help).toContain('Example questions:');
      expect(cmd.help).toMatch(/"id"/);
    });

    it('does NOT document nested option fields (interview has none)', () => {
      expect(cmd.help).not.toContain('nested array');
    });
  });

  describe('simple tools are unaffected', () => {
    const cmd = bridgeTool('calc', {
      name: 'calc', label: 'Calculator',
      description: 'Evaluate a calculation.',
      parameters: Type.Object({ expr: Type.String({ description: 'Expression to evaluate' }) }),
      execute: noop,
    });

    it('does NOT include JSON shape section for flat params', () => {
      expect(cmd.help).not.toContain('JSON shape');
      expect(cmd.help).not.toContain('Example');
    });
  });
});

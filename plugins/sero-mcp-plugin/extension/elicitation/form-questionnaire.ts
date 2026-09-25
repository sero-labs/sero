import type { UserFeedbackAnswer, UserFeedbackQuestionItem, UserFeedbackQuestionOption } from '@sero-ai/common';

/** The value of the Decline option on the first question. */
export const DECLINE_VALUE = '__mcp_decline__';

const MAX_TEXT = 500;

type FieldKind = 'enum' | 'multi-enum' | 'boolean' | 'string' | 'number' | 'integer';

export interface FormField {
  key: string;
  label: string;
  kind: FieldKind;
  required: boolean;
  options: UserFeedbackQuestionOption[];
  schema: Record<string, unknown>;
}

export type FormContent = Record<string, string | number | boolean | string[]>;

export type BuildResult =
  | { ok: true; fields: FormField[]; questions: UserFeedbackQuestionItem[] }
  | { ok: false; reason: string };

export type ParseResult =
  | { kind: 'accept'; content: FormContent }
  | { kind: 'decline' }
  | { kind: 'invalid'; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** Server text is untrusted: keep it plain, printable and short. */
export function plainText(value: unknown, fallback = ''): string {
  if (typeof value !== 'string') return fallback;
  // eslint-disable-next-line no-control-regex
  const text = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
  return text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT - 1)}…` : text || fallback;
}

function stringOptions(values: unknown, names?: unknown): UserFeedbackQuestionOption[] | null {
  if (!Array.isArray(values) || !values.every((value) => typeof value === 'string')) return null;
  return values.map((value, index) => ({
    value,
    label: plainText(Array.isArray(names) ? names[index] : undefined, plainText(value, value)),
  }));
}

function titledOptions(entries: unknown): UserFeedbackQuestionOption[] | null {
  if (!Array.isArray(entries)) return null;
  const options: UserFeedbackQuestionOption[] = [];
  for (const entry of entries) {
    if (!isRecord(entry) || typeof entry.const !== 'string') return null;
    options.push({ value: entry.const, label: plainText(entry.title, entry.const) });
  }
  return options;
}

function describeField(key: string, schema: unknown, required: boolean): FormField | null {
  if (!isRecord(schema)) return null;
  const label = plainText(schema.title, key);
  const field = (kind: FieldKind, options: UserFeedbackQuestionOption[] = []): FormField => ({
    key, label, kind, required, options, schema,
  });
  if (schema.type === 'boolean') {
    return field('boolean', [{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }]);
  }
  if (schema.type === 'number' || schema.type === 'integer') return field(schema.type);
  if (schema.type === 'string') {
    if ('enum' in schema) {
      const options = stringOptions(schema.enum, schema.enumNames);
      return options ? field('enum', options) : null;
    }
    if ('oneOf' in schema) {
      const options = titledOptions(schema.oneOf);
      return options ? field('enum', options) : null;
    }
    return field('string');
  }
  if (schema.type === 'array' && isRecord(schema.items)) {
    const options = 'anyOf' in schema.items
      ? titledOptions(schema.items.anyOf)
      : stringOptions(schema.items.enum);
    return options ? field('multi-enum', options) : null;
  }
  return null;
}

/**
 * Maps an MCP form request to questionnaire questions: one question for each
 * field, and a Decline option on the first question.
 */
export function buildFormQuestions(
  message: string,
  requestedSchema: unknown,
  serverLabel: string,
): BuildResult {
  const properties = isRecord(requestedSchema) && isRecord(requestedSchema.properties) ? requestedSchema.properties : null;
  if (!properties || Object.keys(properties).length === 0) {
    return { ok: false, reason: 'The request has no form fields.' };
  }
  const required = isRecord(requestedSchema) && Array.isArray(requestedSchema.required) ? requestedSchema.required : [];
  const fields: FormField[] = [];
  for (const [key, schema] of Object.entries(properties)) {
    const field = describeField(key, schema, required.includes(key));
    if (!field) {
      return { ok: false, reason: `Field "${plainText(key, 'unnamed')}" uses a type that Sero does not support.` };
    }
    fields.push(field);
  }

  const questions = fields.map((field, index): UserFeedbackQuestionItem => {
    const description = plainText(field.schema.description);
    const prompt = index === 0 ? [plainText(message), description].filter(Boolean).join('\n\n') : description;
    const options = index === 0
      ? [...field.options, {
          value: DECLINE_VALUE,
          label: 'Decline',
          description: `Send no answers to ${serverLabel}.`,
          exclusive: true,
        }]
      : field.options;
    return {
      id: field.key,
      label: field.label,
      prompt: prompt || field.label,
      options,
      allowOther: field.kind === 'string' || field.kind === 'number' || field.kind === 'integer',
      multiSelect: field.kind === 'multi-enum' ? true : undefined,
    };
  });
  return { ok: true, fields, questions };
}

function checkString(field: FormField, text: string): string | null {
  const { minLength, maxLength, format } = field.schema;
  if (typeof minLength === 'number' && text.length < minLength) return `${field.label} needs at least ${minLength} characters.`;
  if (typeof maxLength === 'number' && text.length > maxLength) return `${field.label} allows at most ${maxLength} characters.`;
  if (format === 'email' && !/^[^\s@]+@[^\s@]+$/.test(text)) return `${field.label} must be an email address.`;
  if (format === 'uri' && !URL.canParse(text)) return `${field.label} must be a URL.`;
  if ((format === 'date' || format === 'date-time') && Number.isNaN(Date.parse(text))) return `${field.label} must be a date.`;
  return null;
}

function toValue(field: FormField, values: string[]): { value: FormContent[string] } | { error: string } {
  const allowed = new Set(field.options.map((option) => option.value));
  switch (field.kind) {
    case 'enum':
      return allowed.has(values[0]) ? { value: values[0] } : { error: `Pick one of the listed answers for ${field.label}.` };
    case 'multi-enum': {
      const { minItems, maxItems } = field.schema;
      if (!values.every((value) => allowed.has(value))) return { error: `Pick only listed answers for ${field.label}.` };
      if (typeof minItems === 'number' && values.length < minItems) return { error: `Pick at least ${minItems} answers for ${field.label}.` };
      if (typeof maxItems === 'number' && values.length > maxItems) return { error: `Pick at most ${maxItems} answers for ${field.label}.` };
      return { value: values };
    }
    case 'boolean':
      return values[0] === 'true' || values[0] === 'false'
        ? { value: values[0] === 'true' }
        : { error: `Answer Yes or No for ${field.label}.` };
    case 'string': {
      const error = checkString(field, values[0]);
      return error ? { error } : { value: values[0] };
    }
    case 'number':
    case 'integer': {
      const number = Number(values[0].trim());
      const { minimum, maximum } = field.schema;
      if (values[0].trim() === '' || !Number.isFinite(number)) return { error: `${field.label} must be a number.` };
      if (field.kind === 'integer' && !Number.isInteger(number)) return { error: `${field.label} must be a whole number.` };
      if (typeof minimum === 'number' && number < minimum) return { error: `${field.label} must be at least ${minimum}.` };
      if (typeof maximum === 'number' && number > maximum) return { error: `${field.label} must be at most ${maximum}.` };
      return { value: number };
    }
  }
}

/** Converts questionnaire answers to form content, checked against the field schemas. */
export function parseFormAnswers(fields: FormField[], answers: UserFeedbackAnswer[]): ParseResult {
  if (answers.some((answer) => answer.value === DECLINE_VALUE)) return { kind: 'decline' };
  const content: FormContent = {};
  for (const field of fields) {
    const values = answers.filter((answer) => answer.questionId === field.key).map((answer) => answer.value);
    if (values.length === 0) {
      if (field.required) return { kind: 'invalid', error: `${field.label} is required.` };
      continue;
    }
    const result = toValue(field, values);
    if ('error' in result) return { kind: 'invalid', error: result.error };
    content[field.key] = result.value;
  }
  return { kind: 'accept', content };
}

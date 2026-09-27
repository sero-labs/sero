// ── Questionnaire types (matches Pi SDK `questionnaire` tool) ──

export interface QuestionOption {
  value: string;
  label: string;
  description?: string;
  exclusive?: boolean;
  subQuestion?: QuestionDef;
}

export interface QuestionDef {
  id: string;
  label?: string;
  prompt: string;
  options: QuestionOption[];
  allowOther?: boolean;
  multiSelect?: boolean;
}

export interface QuestionnairePayload {
  questions: QuestionDef[];
}

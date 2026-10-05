export type AskUserQuestionOption = {
  label: string;
  description: string;
};

export type AskUserQuestionQuestion = {
  question: string;
  multiSelect?: boolean;
  options: AskUserQuestionOption[];
};

/** The fields of an AskUserQuestion call the hooks read. The call carries more, and they travel along unchanged. */
export type AskUserQuestionInput = {
  questions: AskUserQuestionQuestion[];
};

/** The fields of an AskUserQuestion result the hooks read. `answers` is keyed by the question text. */
export type AskUserQuestionOutput = {
  questions: AskUserQuestionQuestion[];
  answers: Record<string, string>;
};

function isRecord(value: unknown): value is Record<string, unknown>
{
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isAskUserQuestionOption(value: unknown): value is AskUserQuestionOption
{
  return isRecord(value) && typeof value.label === 'string' && typeof value.description === 'string';
}

function isAskUserQuestionQuestion(value: unknown): value is AskUserQuestionQuestion
{
  return isRecord(value)
    && typeof value.question === 'string'
    && (value.multiSelect === undefined || typeof value.multiSelect === 'boolean')
    && Array.isArray(value.options)
    && value.options.every(isAskUserQuestionOption);
}

export function isAskUserQuestionInput(value: unknown): value is AskUserQuestionInput
{
  return isRecord(value) && Array.isArray(value.questions) && value.questions.every(isAskUserQuestionQuestion);
}

export function isAskUserQuestionOutput(value: unknown): value is AskUserQuestionOutput
{
  return isRecord(value)
    && Array.isArray(value.questions)
    && value.questions.every(isAskUserQuestionQuestion)
    && isRecord(value.answers)
    && Object.values(value.answers).every((answer) => { return typeof answer === 'string'; });
}

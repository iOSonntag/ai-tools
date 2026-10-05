import type { AskUserQuestionOption, AskUserQuestionOutput } from './ask-user-question.ts';

const scoreSuffixPattern = / - \d{1,3}%$/;

export function appendScoreToLabel(label: string, percent: number): string
{
  return `${label} - ${percent}%`;
}

export function hasScoreSuffix(label: string): boolean
{
  return scoreSuffixPattern.test(label);
}

export function hasScoredOptionLabel(output: AskUserQuestionOutput): boolean
{
  return output.questions.some((question) =>
  {
    return question.options.some((option) => { return hasScoreSuffix(option.label); });
  });
}

function stripScoreFromLabel(label: string): string
{
  return label.replace(scoreSuffixPattern, '');
}

function stripScoresFromAnswer(answer: string, options: AskUserQuestionOption[]): string
{
  return options.reduce((strippedAnswer, option) =>
  {
    const strippedLabel = stripScoreFromLabel(option.label);

    // A multiple choice joins its labels with ", " and writes a label that holds ", " or a quote as a JSON string.
    return strippedAnswer
      .replaceAll(JSON.stringify(option.label), JSON.stringify(strippedLabel))
      .replaceAll(option.label, strippedLabel);
  }, answer);
}

/** Takes the figure off every option label, and off every answer that names a scored label, which covers a multiple choice. */
export function stripScoresFromOutput(output: AskUserQuestionOutput): AskUserQuestionOutput
{
  const answers = Object.fromEntries(Object.entries(output.answers).map(([questionText, answer]) =>
  {
    const answeredQuestion = output.questions.find((question) => { return question.question === questionText; });

    return [questionText, stripScoresFromAnswer(answer, answeredQuestion?.options ?? [])];
  }));
  const questions = output.questions.map((question) =>
  {
    const options = question.options.map((option) => { return { ...option, label: stripScoreFromLabel(option.label) }; });

    return { ...question, options: options };
  });

  return { ...output, questions: questions, answers: answers };
}

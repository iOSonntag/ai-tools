import type { AskUserQuestionInput, AskUserQuestionOption, AskUserQuestionQuestion } from './ask-user-question.ts';
import type { OptionRatings, OptionRatingsParse } from './ratings.ts';
import type { ScoreConstants } from './score-options.ts';

import { findPartlyRatedAxis, maxAxisRating, parseOptionRatings, ratingsFormat } from './ratings.ts';
import { appendScoreToLabel, hasScoreSuffix } from './score-label.ts';
import { scoreOptions } from './score-options.ts';

export type ScoredQuestionRecord = {
  question: string;
  isMultiSelect: boolean;
  options: { label: string; ratings: OptionRatings; percent: number }[];
};

export type AskedQuestionsScoringScored = {
  kind: 'scored';
  input: AskUserQuestionInput;
  records: ScoredQuestionRecord[];
};

/** `problems` are written for the model that asked, one per fault. */
export type AskedQuestionsScoringRejected = {
  kind: 'rejected';
  problems: string[];
};

export type AskedQuestionsScoring = AskedQuestionsScoringScored | AskedQuestionsScoringRejected;

type OptionReadingRead = {
  kind: 'read';
  option: AskUserQuestionOption;
  ratings: OptionRatings;
  descriptionWithoutRatings: string;
};

type OptionReadingRejected = {
  kind: 'rejected';
  problems: string[];
};

type OptionReading = OptionReadingRead | OptionReadingRejected;

type QuestionScoringScored = {
  kind: 'scored';
  question: AskUserQuestionQuestion;
  record: ScoredQuestionRecord;
};

type QuestionScoringRejected = {
  kind: 'rejected';
  problems: string[];
};

type QuestionScoring = QuestionScoringScored | QuestionScoringRejected;

function describeRatingsProblem(parse: OptionRatingsParse): string | null
{
  switch (parse.outcome)
  {
    case 'parsed':
      return null;
    case 'malformed':
      return `the description does not end in ${ratingsFormat}, each n from 0 to ${maxAxisRating}, or – for an axis outside the question`;
    case 'required-axis-unrated':
      return `${parse.axisName} is –, but intent and evidence take a rating in every question`;
  }
}

function readOption(questionText: string, option: AskUserQuestionOption): OptionReading
{
  const parse = parseOptionRatings(option.description);
  const labelProblem = hasScoreSuffix(option.label) ? 'the label ends in a figure, which the hook adds, so the label carries none' : null;
  const problems = [labelProblem, describeRatingsProblem(parse)].flatMap((problem) =>
  {
    return problem === null ? [] : [`Question "${questionText}", option "${option.label}": ${problem}.`];
  });

  if (problems.length > 0 || parse.outcome !== 'parsed')
  {
    return { kind: 'rejected', problems: problems };
  }

  return {
    kind: 'read',
    option: option,
    ratings: parse.ratings,
    descriptionWithoutRatings: parse.descriptionWithoutRatings,
  };
}

function scoreQuestion(question: AskUserQuestionQuestion, constants: ScoreConstants): QuestionScoring
{
  const readings = question.options.map((option) => { return readOption(question.question, option); });
  const problems = readings.flatMap((reading) => { return reading.kind === 'rejected' ? reading.problems : []; });
  const readOptions = readings.flatMap((reading) => { return reading.kind === 'read' ? [reading] : []; });

  if (problems.length > 0)
  {
    return { kind: 'rejected', problems: problems };
  }

  const ratingsOfOptions = readOptions.map((readOption) => { return readOption.ratings; });
  const partlyRatedAxisName = findPartlyRatedAxis(ratingsOfOptions);

  if (partlyRatedAxisName !== null)
  {
    return {
      kind: 'rejected',
      problems: [
        `Question "${question.question}": ${partlyRatedAxisName} is rated for some options and – for others; rate it for every option, or mark it – for every option.`,
      ],
    };
  }

  const isMultiSelect = question.multiSelect === true;
  const percents = scoreOptions({ ratingsOfOptions: ratingsOfOptions, isMultiSelect: isMultiSelect, constants: constants });
  const scoredReadOptions = readOptions.map((readOption, index) =>
  {
    const percent = percents[index];

    if (percent === undefined)
    {
      throw new Error(`the scores cover ${percents.length} of ${readOptions.length} options`);
    }

    return { ...readOption, percent: percent };
  });
  const scoredOptions = scoredReadOptions.map((scoredReadOption) =>
  {
    return {
      ...scoredReadOption.option,
      label: appendScoreToLabel(scoredReadOption.option.label, scoredReadOption.percent),
      description: scoredReadOption.descriptionWithoutRatings,
    };
  });
  const optionRecords = scoredReadOptions.map((scoredReadOption) =>
  {
    return { label: scoredReadOption.option.label, ratings: scoredReadOption.ratings, percent: scoredReadOption.percent };
  });

  return {
    kind: 'scored',
    question: { ...question, options: scoredOptions },
    record: { question: question.question, isMultiSelect: isMultiSelect, options: optionRecords },
  };
}

/** Replaces the ratings of every option with its figure, or rejects the whole call when any question breaks the form. */
export function scoreAskedQuestions(input: AskUserQuestionInput, constants: ScoreConstants): AskedQuestionsScoring
{
  const scorings = input.questions.map((question) => { return scoreQuestion(question, constants); });
  const problems = scorings.flatMap((scoring) => { return scoring.kind === 'rejected' ? scoring.problems : []; });
  const scoredQuestions = scorings.flatMap((scoring) => { return scoring.kind === 'scored' ? [scoring] : []; });

  if (problems.length > 0)
  {
    return { kind: 'rejected', problems: problems };
  }

  return {
    kind: 'scored',
    input: { ...input, questions: scoredQuestions.map((scoredQuestion) => { return scoredQuestion.question; }) },
    records: scoredQuestions.map((scoredQuestion) => { return scoredQuestion.record; }),
  };
}

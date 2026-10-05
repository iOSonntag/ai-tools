import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import type { AskUserQuestionInput } from './ask-user-question.ts';

import exampleConstants from './example-constants.ts';
import { scoreAskedQuestions } from './score-questions.ts';

const strongRatings = '[ease 3, convention 3, agreement 5, intent 8, truth 8, durability 8, integrity 8, growth 8, evidence 10]';
const middlingRatings = '[ease 10, convention 10, agreement 5, intent 5, truth 5, durability 5, integrity 5, growth 5, evidence 10]';

function buildInput(firstDescription: string, secondDescription: string): AskUserQuestionInput
{
  return {
    questions: [
      {
        question: 'Which cache?',
        multiSelect: false,
        options: [
          { label: 'Keep the cache', description: firstDescription },
          { label: 'Drop it', description: secondDescription },
        ],
      },
    ],
  };
}

describe('scoreAskedQuestions', () =>
{
  test('puts the figure on each label and takes the ratings off each description', () =>
  {
    const scoring = scoreAskedQuestions(
      buildInput(`Per user. ${strongRatings}`, `Read through. ${middlingRatings}`),
      exampleConstants,
    );

    assert.equal(scoring.kind, 'scored');
    assert.deepEqual(scoring.kind === 'scored' && scoring.input.questions[0]?.options, [
      { label: 'Keep the cache - 71%', description: 'Per user.' },
      { label: 'Drop it - 15%', description: 'Read through.' },
    ]);
    assert.equal(scoring.kind === 'scored' && scoring.records[0]?.options[0]?.ratings.intent, 8);
  });

  test('keeps the fields of the call it does not read', () =>
  {
    const input = buildInput(strongRatings, middlingRatings);
    const scoring = scoreAskedQuestions(
      { ...input, questions: input.questions.map((question) => { return { ...question, header: 'Cache' }; }) },
      exampleConstants,
    );

    assert.equal(scoring.kind === 'scored' && 'header' in (scoring.input.questions[0] ?? {}), true);
  });

  test('rejects a label that carries a figure of its own', () =>
  {
    const input = buildInput(strongRatings, middlingRatings);
    const scoring = scoreAskedQuestions(
      {
        questions: input.questions.map((question) =>
        {
          return { ...question, options: [{ label: 'Keep - 70%', description: strongRatings }, ...question.options.slice(1)] };
        }),
      },
      exampleConstants,
    );

    assert.equal(scoring.kind, 'rejected');
    assert.match(scoring.kind === 'rejected' ? scoring.problems.join('\n') : '', /option "Keep - 70%": the label ends in a figure/);
  });

  test('rejects an option without ratings and names it', () =>
  {
    const scoring = scoreAskedQuestions(buildInput('Per user.', middlingRatings), exampleConstants);

    assert.equal(scoring.kind, 'rejected');
    assert.match(scoring.kind === 'rejected' ? scoring.problems.join('\n') : '', /option "Keep the cache": the description does not end in \[ease n/);
  });

  test('rejects an axis rated for one option and unrated for the other', () =>
  {
    const scoring = scoreAskedQuestions(buildInput(strongRatings, middlingRatings.replace('growth 5', 'growth –')), exampleConstants);

    assert.equal(scoring.kind, 'rejected');
    assert.match(scoring.kind === 'rejected' ? scoring.problems.join('\n') : '', /growth is rated for some options/);
  });
});

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import type { AskUserQuestionOutput } from './ask-user-question.ts';

import { appendScoreToLabel, hasScoredOptionLabel, hasScoreSuffix, stripScoresFromOutput } from './score-label.ts';

function buildOutput(answer: string): AskUserQuestionOutput
{
  return {
    questions: [
      {
        question: 'Which cache?',
        multiSelect: false,
        options: [
          { label: 'Keep the cache - 70%', description: 'd' },
          { label: 'Drop it - 15%', description: 'd' },
        ],
      },
    ],
    answers: { 'Which cache?': answer },
  };
}

describe('appendScoreToLabel', () =>
{
  test('ends the label in the figure the suffix check finds', () =>
  {
    const label = appendScoreToLabel('Keep the cache', 70);

    assert.equal(label, 'Keep the cache - 70%');
    assert.equal(hasScoreSuffix(label), true);
    assert.equal(hasScoreSuffix('Keep the cache'), false);
  });
});

describe('stripScoresFromOutput', () =>
{
  test('gives back the labels and the answer the model wrote', () =>
  {
    const output = stripScoresFromOutput(buildOutput('Keep the cache - 70%'));

    assert.deepEqual(output.answers, { 'Which cache?': 'Keep the cache' });
    assert.deepEqual(output.questions[0]?.options.map((option) => { return option.label; }), ['Keep the cache', 'Drop it']);
  });

  test('strips every label a multiple choice joins into one answer', () =>
  {
    const output = stripScoresFromOutput(buildOutput('Keep the cache - 70%, Drop it - 15%'));

    assert.deepEqual(output.answers, { 'Which cache?': 'Keep the cache, Drop it' });
  });

  test('strips a label a multiple choice writes as a JSON string', () =>
  {
    const output = stripScoresFromOutput({
      questions: [
        {
          question: 'Which parts?',
          multiSelect: true,
          options: [
            { label: 'Sequenz-Inhalte - 85%', description: 'd' },
            { label: 'CE "Weitere Inhalte" - 60%', description: 'd' },
            { label: 'Ziele, Inhalte - 40%', description: 'd' },
          ],
        },
      ],
      answers: { 'Which parts?': 'Sequenz-Inhalte - 85%, "CE \\"Weitere Inhalte\\" - 60%", "Ziele, Inhalte - 40%"' },
    });

    assert.deepEqual(output.answers, { 'Which parts?': 'Sequenz-Inhalte, "CE \\"Weitere Inhalte\\"", "Ziele, Inhalte"' });
  });

  test('leaves an answer the user typed as it is', () =>
  {
    const output = stripScoresFromOutput(buildOutput('Shrink it to 10 entries'));

    assert.deepEqual(output.answers, { 'Which cache?': 'Shrink it to 10 entries' });
  });

  test('keeps the fields it does not read', () =>
  {
    const annotatedOutput = { ...buildOutput('Drop it - 15%'), annotations: { 'Which cache?': { notes: 'n' } } };
    const output = stripScoresFromOutput(annotatedOutput);

    assert.deepEqual('annotations' in output && output.annotations, { 'Which cache?': { notes: 'n' } });
  });
});

describe('hasScoredOptionLabel', () =>
{
  test('tells a scored result from an unscored one', () =>
  {
    assert.equal(hasScoredOptionLabel(buildOutput('Drop it - 15%')), true);
    assert.equal(hasScoredOptionLabel(stripScoresFromOutput(buildOutput('Drop it - 15%'))), false);
  });
});

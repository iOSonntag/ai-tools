import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import type { AxisRating, OptionRatings } from './ratings.ts';

import exampleConstants from './example-constants.ts';
import { scoreOptions } from './score-options.ts';

function buildUniformRatings(rating: AxisRating, evidence: AxisRating): OptionRatings
{
  return {
    ease: rating,
    convention: rating,
    agreement: rating,
    intent: rating,
    truth: rating,
    durability: rating,
    integrity: rating,
    growth: rating,
    evidence: evidence,
  };
}

describe('scoreOptions', () =>
{
  test('gives a stronger option the larger share and keeps the rest for none of them', () =>
  {
    const percents = scoreOptions({
      ratingsOfOptions: [buildUniformRatings(8, 10), buildUniformRatings(5, 10)],
      isMultiSelect: false,
      constants: exampleConstants,
    });

    assert.deepEqual(percents, [71, 15]);
  });

  test('pulls the options of a guess toward each other', () =>
  {
    const percents = scoreOptions({
      ratingsOfOptions: [buildUniformRatings(8, 0), buildUniformRatings(5, 0)],
      isMultiSelect: false,
      constants: exampleConstants,
    });

    assert.deepEqual(percents, [51, 31]);
  });

  test('lets an axis of weight 0 not move the figure', () =>
  {
    // A multiple choice rounds each figure on its own. The shared rounding of a single choice can raise one of
    // two equal shares by a step, which would hide whether the weight moved the figure.
    const percents = scoreOptions({
      ratingsOfOptions: [
        { ...buildUniformRatings(8, 10), ease: 10, convention: 10, agreement: 10 },
        { ...buildUniformRatings(8, 10), ease: 0, convention: 0, agreement: 0 },
      ],
      isMultiSelect: true,
      constants: exampleConstants,
    });

    assert.equal(percents[0], percents[1]);
  });

  test('cannot make up for a missed goal with the other axes', () =>
  {
    const percents = scoreOptions({
      ratingsOfOptions: [{ ...buildUniformRatings(10, 10), intent: 0 }, buildUniformRatings(5, 10)],
      isMultiSelect: false,
      constants: exampleConstants,
    });

    assert.ok((percents[0] ?? 0) < (percents[1] ?? 0));
  });

  test('scores a question of intent alone on the scale of a full one', () =>
  {
    const onlyIntent = { ease: null, convention: null, agreement: null, truth: null, durability: null, integrity: null, growth: null };
    const percents = scoreOptions({
      ratingsOfOptions: [
        { ...onlyIntent, intent: 8, evidence: 10 },
        { ...onlyIntent, intent: 5, evidence: 10 },
      ],
      isMultiSelect: false,
      constants: exampleConstants,
    });

    assert.deepEqual(percents, [71, 15]);
  });

  test('keeps the figures of a single choice within 100', () =>
  {
    const percents = scoreOptions({
      ratingsOfOptions: [buildUniformRatings(10, 10), buildUniformRatings(10, 10), buildUniformRatings(10, 10), buildUniformRatings(10, 10)],
      isMultiSelect: false,
      constants: exampleConstants,
    });
    const total = percents.reduce((sum, percent) => { return sum + percent; }, 0);

    assert.ok(total <= 100);
  });

  test('scores each option of a multiple choice on its own', () =>
  {
    const percents = scoreOptions({
      ratingsOfOptions: [buildUniformRatings(10, 10), buildUniformRatings(10, 10), buildUniformRatings(5, 10)],
      isMultiSelect: true,
      constants: exampleConstants,
    });

    assert.deepEqual(percents, [92, 92, 50]);
  });

  test('throws on a percent step that does not divide 100', () =>
  {
    assert.throws(() =>
    {
      scoreOptions({
        ratingsOfOptions: [buildUniformRatings(8, 10), buildUniformRatings(5, 10)],
        isMultiSelect: false,
        constants: { ...exampleConstants, percentStep: 7 },
      });
    });
  });
});

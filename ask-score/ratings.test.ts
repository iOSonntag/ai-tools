import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import type { OptionRatings } from './ratings.ts';

import { findPartlyRatedAxis, parseOptionRatings } from './ratings.ts';

const fullRatings = '[ease 0, convention 8, agreement 5, intent 10, truth 7, durability 6, integrity 8, growth 6, evidence 3]';

const ratingsOfPlainOption: OptionRatings = {
  ease: 3,
  convention: 3,
  agreement: 3,
  intent: 3,
  truth: 3,
  durability: 3,
  integrity: 3,
  growth: 3,
  evidence: 3,
};

describe('parseOptionRatings', () =>
{
  test('reads every axis and takes the ratings off the description', () =>
  {
    const parse = parseOptionRatings(`Caches per user. ${fullRatings}`);

    assert.deepEqual(parse, {
      outcome: 'parsed',
      ratings: {
        ease: 0,
        convention: 8,
        agreement: 5,
        intent: 10,
        truth: 7,
        durability: 6,
        integrity: 8,
        growth: 6,
        evidence: 3,
      },
      descriptionWithoutRatings: 'Caches per user.',
    });
  });

  test('reads an en dash and a hyphen as an axis outside the question', () =>
  {
    const parse = parseOptionRatings(
      'Pick a.ts [ease –, convention -, agreement 3, intent 4, truth –, durability –, integrity –, growth –, evidence 3]',
    );

    assert.equal(parse.outcome, 'parsed');
    assert.equal(parse.outcome === 'parsed' && parse.ratings.ease, null);
    assert.equal(parse.outcome === 'parsed' && parse.ratings.convention, null);
  });

  test('rejects a description without ratings', () =>
  {
    assert.deepEqual(parseOptionRatings('Caches per user.'), { outcome: 'malformed' });
  });

  test('rejects axes out of order', () =>
  {
    const parse = parseOptionRatings(
      '[convention 4, ease 2, agreement 3, intent 5, truth 4, durability 3, integrity 4, growth 3, evidence 2]',
    );

    assert.deepEqual(parse, { outcome: 'malformed' });
  });

  test('rejects a rating above 10', () =>
  {
    const parse = parseOptionRatings(
      '[ease 2, convention 4, agreement 3, intent 11, truth 4, durability 3, integrity 4, growth 3, evidence 2]',
    );

    assert.deepEqual(parse, { outcome: 'malformed' });
  });

  test('rejects ratings that do not end the description', () =>
  {
    assert.deepEqual(parseOptionRatings(`${fullRatings} Caches per user.`), { outcome: 'malformed' });
  });

  test('rejects intent left unrated', () =>
  {
    const parse = parseOptionRatings(
      '[ease 2, convention 4, agreement 3, intent –, truth 4, durability 3, integrity 4, growth 3, evidence 2]',
    );

    assert.deepEqual(parse, { outcome: 'required-axis-unrated', axisName: 'intent' });
  });

  test('rejects evidence left unrated', () =>
  {
    const parse = parseOptionRatings(
      '[ease 2, convention 4, agreement 3, intent 4, truth 4, durability 3, integrity 4, growth 3, evidence -]',
    );

    assert.deepEqual(parse, { outcome: 'required-axis-unrated', axisName: 'evidence' });
  });
});

describe('findPartlyRatedAxis', () =>
{
  test('finds nothing when every axis is rated for all options or for none', () =>
  {
    const unratedTruth = { ...ratingsOfPlainOption, truth: null };

    assert.equal(findPartlyRatedAxis([unratedTruth, unratedTruth]), null);
  });

  test('finds an axis rated for one option and unrated for another', () =>
  {
    assert.equal(findPartlyRatedAxis([ratingsOfPlainOption, { ...ratingsOfPlainOption, growth: null }]), 'growth');
  });
});

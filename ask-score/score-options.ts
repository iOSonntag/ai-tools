import type { AxisName, AxisRating, OptionRatings } from './ratings.ts';

import { axisNames, maxAxisRating } from './ratings.ts';

export type QualityAxisName = Exclude<AxisName, 'intent' | 'evidence'>;

function isQualityAxisName(axisName: AxisName): axisName is QualityAxisName
{
  return axisName !== 'intent' && axisName !== 'evidence';
}

export const qualityAxisNames = axisNames.filter(isQualityAxisName);

export type ScoreConstants = {
  /** Tells the figures of one table from those of another in the score log. */
  version: number;
  /** The weights of the quality axes a question rates are scaled to sum to 1. */
  qualityWeights: Record<QualityAxisName, number>;
  /** The worth a rating of 0 keeps on intent or a quality axis. A 10 is worth 1, the ratings between lie on the line. */
  ratingWorthFloor: number;
  /**
   * The share of its distance from the mean of its question a worth keeps at an evidence of 0. A 10 keeps all of
   * it, the ratings between lie on the line.
   */
  evidenceTrustFloor: number;
  /** The power the worths are raised to before they are shared out; a higher one gives the best option more. */
  sharpness: number;
  /** The answer none of the options gives is worth an option with this rating on every axis its question rates. */
  outsideOptionRating: AxisRating;
  /** Must divide 100. */
  percentStep: number;
};

function sumNumbers(numbers: number[]): number
{
  return numbers.reduce((total, value) => { return total + value; }, 0);
}

function scaleRatingAboveFloor(rating: AxisRating, floor: number): number
{
  return floor + (1 - floor) * rating / maxAxisRating;
}

function computeLogQuality(ratings: OptionRatings, constants: ScoreConstants): number | null
{
  const ratedAxes = qualityAxisNames.flatMap((axisName) =>
  {
    const rating = ratings[axisName];

    if (rating === null)
    {
      return [];
    }

    return [{ weight: constants.qualityWeights[axisName], rating: rating }];
  });
  const weightSum = sumNumbers(ratedAxes.map((ratedAxis) => { return ratedAxis.weight; }));

  if (weightSum === 0)
  {
    return null;
  }

  const weightedLogSum = sumNumbers(ratedAxes.map((ratedAxis) =>
  {
    return ratedAxis.weight * Math.log(scaleRatingAboveFloor(ratedAxis.rating, constants.ratingWorthFloor));
  }));

  return weightedLogSum / weightSum;
}

function computeLogWorth(ratings: OptionRatings, constants: ScoreConstants): number
{
  const logIntent = Math.log(scaleRatingAboveFloor(ratings.intent, constants.ratingWorthFloor));
  const logQuality = computeLogQuality(ratings, constants);

  // Intent gates quality: an option that misses the goal is worth little however well it is built.
  // A question that weighs no quality, such as which file the user meant, lets intent stand for quality too,
  // so a worth spans the same range in every kind of question.
  return logIntent + (logQuality ?? logIntent);
}

function buildOutsideOptionRatings(ratingsOfOptions: OptionRatings[], outsideOptionRating: AxisRating): OptionRatings
{
  const firstRatings = ratingsOfOptions[0];

  if (firstRatings === undefined)
  {
    throw new Error('a question without options has nothing to score');
  }

  const toOutsideRating = (rating: AxisRating | null): AxisRating | null =>
  {
    return rating === null ? null : outsideOptionRating;
  };

  return {
    ease: toOutsideRating(firstRatings.ease),
    convention: toOutsideRating(firstRatings.convention),
    agreement: toOutsideRating(firstRatings.agreement),
    intent: outsideOptionRating,
    truth: toOutsideRating(firstRatings.truth),
    durability: toOutsideRating(firstRatings.durability),
    integrity: toOutsideRating(firstRatings.integrity),
    growth: toOutsideRating(firstRatings.growth),
    evidence: outsideOptionRating,
  };
}

function computeTrustedWorths(ratingsOfOptions: OptionRatings[], constants: ScoreConstants): number[]
{
  const appraisals = ratingsOfOptions.map((ratings) =>
  {
    return {
      logWorth: computeLogWorth(ratings, constants),
      trust: scaleRatingAboveFloor(ratings.evidence, constants.evidenceTrustFloor),
    };
  });
  const meanLogWorth = sumNumbers(appraisals.map((appraisal) => { return appraisal.logWorth; })) / appraisals.length;

  return appraisals.map((appraisal) =>
  {
    return Math.exp(meanLogWorth + appraisal.trust * (appraisal.logWorth - meanLogWorth));
  });
}

function roundSharesToPercentSteps(shares: number[], percentStep: number): number[]
{
  const stepCount = 100 / percentStep;

  if (!Number.isInteger(stepCount))
  {
    throw new Error(`the percent step ${percentStep} does not divide 100`);
  }

  const portions = shares.map((share, index) =>
  {
    const scaledShare = share * stepCount;

    return { index: index, steps: Math.floor(scaledShare), remainder: scaledShare - Math.floor(scaledShare) };
  });
  const missingStepCount = stepCount - sumNumbers(portions.map((portion) => { return portion.steps; }));
  const raisedIndices = new Set(
    portions
      .toSorted((left, right) => { return right.remainder - left.remainder; })
      .slice(0, missingStepCount)
      .map((portion) => { return portion.index; }),
  );

  return portions.map((portion) =>
  {
    return (raisedIndices.has(portion.index) ? portion.steps + 1 : portion.steps) * percentStep;
  });
}

/**
 * Returns the figure in percent for each option, in the order of the options. The figures of a single choice
 * sum to at most 100, the rest going to "none of them"; those of a multiple choice stand each on its own.
 * Expects every axis rated for all options or for none.
 */
export function scoreOptions(params: {
  ratingsOfOptions: OptionRatings[];
  isMultiSelect: boolean;
  constants: ScoreConstants;
}): number[]
{
  const sharpenedWorths = computeTrustedWorths(params.ratingsOfOptions, params.constants).map((worth) =>
  {
    return worth ** params.constants.sharpness;
  });
  const outsideOptionRatings = buildOutsideOptionRatings(params.ratingsOfOptions, params.constants.outsideOptionRating);
  const outsideLogWorth = computeLogWorth(outsideOptionRatings, params.constants);
  const sharpenedOutsideWorth = Math.exp(outsideLogWorth) ** params.constants.sharpness;

  if (params.isMultiSelect)
  {
    return sharpenedWorths.map((worth) =>
    {
      const share = worth / (worth + sharpenedOutsideWorth);

      return Math.round(share * 100 / params.constants.percentStep) * params.constants.percentStep;
    });
  }

  const totalWorth = sharpenedOutsideWorth + sumNumbers(sharpenedWorths);
  const shares = [...sharpenedWorths, sharpenedOutsideWorth].map((worth) => { return worth / totalWorth; });

  return roundSharesToPercentSteps(shares, params.constants.percentStep).slice(0, -1);
}

export const axisNames = [
  'ease',
  'convention',
  'agreement',
  'intent',
  'truth',
  'durability',
  'integrity',
  'growth',
  'evidence',
] as const;

export type AxisName = (typeof axisNames)[number];

export type AxisRating = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export const maxAxisRating = 10;

/** The ratings of one option. `null` marks an axis outside the question. */
export type OptionRatings = {
  ease: AxisRating | null;
  convention: AxisRating | null;
  agreement: AxisRating | null;
  intent: AxisRating;
  truth: AxisRating | null;
  durability: AxisRating | null;
  integrity: AxisRating | null;
  growth: AxisRating | null;
  evidence: AxisRating;
};

export type OptionRatingsParseParsed = {
  outcome: 'parsed';
  ratings: OptionRatings;
  descriptionWithoutRatings: string;
};

export type OptionRatingsParseMalformed = {
  outcome: 'malformed';
};

export type OptionRatingsParseRequiredAxisUnrated = {
  outcome: 'required-axis-unrated';
  axisName: 'intent' | 'evidence';
};

export type OptionRatingsParse =
  | OptionRatingsParseParsed
  | OptionRatingsParseMalformed
  | OptionRatingsParseRequiredAxisUnrated;

export const ratingsFormat = `[${axisNames.map((axisName) => { return `${axisName} n`; }).join(', ')}]`;

const unratedMarks = ['–', '-'];

const ratingsPattern = new RegExp(
  `\\s*\\[\\s*${
    axisNames.map((axisName) => { return `${axisName}\\s+(?<${axisName}>10|[0-9]|${unratedMarks.join('|')})`; }).join('\\s*,\\s*')
  }\\s*\\]\\s*$`,
);

export function isAxisRating(value: number): value is AxisRating
{
  return Number.isInteger(value) && value >= 0 && value <= maxAxisRating;
}

function toAxisRating(ratingText: string | undefined): AxisRating | null
{
  if (ratingText !== undefined && unratedMarks.includes(ratingText))
  {
    return null;
  }

  const rating = Number(ratingText);

  if (!isAxisRating(rating))
  {
    throw new Error(`the ratings pattern let through the rating "${ratingText}"`);
  }

  return rating;
}

/** Reads the ratings at the end of an option description, in the order and form of `ratingsFormat`. */
export function parseOptionRatings(description: string): OptionRatingsParse
{
  const ratingTexts = ratingsPattern.exec(description)?.groups;

  if (ratingTexts === undefined)
  {
    return { outcome: 'malformed' };
  }

  const intent = toAxisRating(ratingTexts.intent);

  if (intent === null)
  {
    return { outcome: 'required-axis-unrated', axisName: 'intent' };
  }

  const evidence = toAxisRating(ratingTexts.evidence);

  if (evidence === null)
  {
    return { outcome: 'required-axis-unrated', axisName: 'evidence' };
  }

  return {
    outcome: 'parsed',
    ratings: {
      ease: toAxisRating(ratingTexts.ease),
      convention: toAxisRating(ratingTexts.convention),
      agreement: toAxisRating(ratingTexts.agreement),
      intent: intent,
      truth: toAxisRating(ratingTexts.truth),
      durability: toAxisRating(ratingTexts.durability),
      integrity: toAxisRating(ratingTexts.integrity),
      growth: toAxisRating(ratingTexts.growth),
      evidence: evidence,
    },
    descriptionWithoutRatings: description.replace(ratingsPattern, ''),
  };
}

/** Returns the first axis that some options rate and others leave unrated, or `null` when none does. */
export function findPartlyRatedAxis(ratingsOfOptions: OptionRatings[]): AxisName | null
{
  const partlyRatedAxisName = axisNames.find((axisName) =>
  {
    const unratedCount = ratingsOfOptions.filter((ratings) => { return ratings[axisName] === null; }).length;

    return unratedCount > 0 && unratedCount < ratingsOfOptions.length;
  });

  return partlyRatedAxisName ?? null;
}

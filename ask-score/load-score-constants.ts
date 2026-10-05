import type { AxisRating } from './ratings.ts';
import type { QualityAxisName, ScoreConstants } from './score-options.ts';

import { pathToFileURL } from 'node:url';

import { isAxisRating } from './ratings.ts';
import { qualityAxisNames } from './score-options.ts';

export type ScoreConstantsLoadLoaded = {
  kind: 'loaded';
  constants: ScoreConstants;
};

export type ScoreConstantsLoadUnloadable = {
  kind: 'unloadable';
  error: string;
};

export type ScoreConstantsLoadInvalid = {
  kind: 'invalid';
  problems: string[];
};

export type ScoreConstantsLoad = ScoreConstantsLoadLoaded | ScoreConstantsLoadUnloadable | ScoreConstantsLoadInvalid;

export type ScoreConstantsValidation = { isValid: true; constants: ScoreConstants } | { isValid: false; problems: string[] };

type FieldRead<T> = { isRead: true; value: T } | { isRead: false; problems: string[] };

type ConstantsModuleImport = { isImported: true; constantsModule: unknown } | { isImported: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown>
{
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readNumberField(params: {
  constants: Record<string, unknown>;
  fieldName: string;
  requirement: string;
  isAllowed: (value: number) => boolean;
}): FieldRead<number>
{
  const value = params.constants[params.fieldName];

  if (typeof value !== 'number' || !Number.isFinite(value) || !params.isAllowed(value))
  {
    return { isRead: false, problems: [`${params.fieldName} must be ${params.requirement}`] };
  }

  return { isRead: true, value: value };
}

function readOutsideOptionRating(constants: Record<string, unknown>): FieldRead<AxisRating>
{
  const rating = constants.outsideOptionRating;

  if (typeof rating !== 'number' || !isAxisRating(rating))
  {
    return { isRead: false, problems: ['outsideOptionRating must be a whole number from 0 to 10'] };
  }

  return { isRead: true, value: rating };
}

function readQualityWeights(constants: Record<string, unknown>): FieldRead<Record<QualityAxisName, number>>
{
  const weights = constants.qualityWeights;

  if (!isRecord(weights))
  {
    return { isRead: false, problems: [`qualityWeights must be an object with a weight for each of ${qualityAxisNames.join(', ')}`] };
  }

  const weightReads = qualityAxisNames.map((axisName) =>
  {
    return {
      axisName: axisName,
      weightRead: readNumberField({
        constants: weights,
        fieldName: axisName,
        requirement: 'a number of 0 or more',
        isAllowed: (weight) => { return weight >= 0; },
      }),
    };
  });
  const problems = weightReads.flatMap((entry) =>
  {
    return entry.weightRead.isRead ? [] : entry.weightRead.problems.map((problem) => { return `qualityWeights.${problem}`; });
  });

  if (problems.length > 0)
  {
    return { isRead: false, problems: problems };
  }

  const weightEntries = weightReads.flatMap((entry) =>
  {
    return entry.weightRead.isRead ? [[entry.axisName, entry.weightRead.value] as const] : [];
  });

  // Object.fromEntries widens the keys to string; every quality axis has an entry here.
  return { isRead: true, value: Object.fromEntries(weightEntries) as Record<QualityAxisName, number> };
}

/** Checks a value against `ScoreConstants` and lists every fault it finds. */
export function validateScoreConstants(value: unknown): ScoreConstantsValidation
{
  if (!isRecord(value))
  {
    return { isValid: false, problems: ['the constants must be an object'] };
  }

  const version = readNumberField({
    constants: value,
    fieldName: 'version',
    requirement: 'a whole number above 0',
    isAllowed: (number) => { return Number.isInteger(number) && number > 0; },
  });
  const qualityWeights = readQualityWeights(value);
  // The floor of a rating's worth goes through a logarithm, so it must stay above 0.
  const ratingWorthFloor = readNumberField({
    constants: value,
    fieldName: 'ratingWorthFloor',
    requirement: 'a number above 0 and at most 1',
    isAllowed: (number) => { return number > 0 && number <= 1; },
  });
  const evidenceTrustFloor = readNumberField({
    constants: value,
    fieldName: 'evidenceTrustFloor',
    requirement: 'a number from 0 to 1',
    isAllowed: (number) => { return number >= 0 && number <= 1; },
  });
  const sharpness = readNumberField({
    constants: value,
    fieldName: 'sharpness',
    requirement: 'a number above 0',
    isAllowed: (number) => { return number > 0; },
  });
  const outsideOptionRating = readOutsideOptionRating(value);
  const percentStep = readNumberField({
    constants: value,
    fieldName: 'percentStep',
    requirement: 'a number above 0 that divides 100',
    isAllowed: (number) => { return number > 0 && Number.isInteger(100 / number); },
  });

  if (
    version.isRead && qualityWeights.isRead && ratingWorthFloor.isRead && evidenceTrustFloor.isRead && sharpness.isRead
    && outsideOptionRating.isRead && percentStep.isRead
  )
  {
    return {
      isValid: true,
      constants: {
        version: version.value,
        qualityWeights: qualityWeights.value,
        ratingWorthFloor: ratingWorthFloor.value,
        evidenceTrustFloor: evidenceTrustFloor.value,
        sharpness: sharpness.value,
        outsideOptionRating: outsideOptionRating.value,
        percentStep: percentStep.value,
      },
    };
  }

  const fieldReads = [version, qualityWeights, ratingWorthFloor, evidenceTrustFloor, sharpness, outsideOptionRating, percentStep];

  return {
    isValid: false,
    problems: fieldReads.flatMap((fieldRead) => { return fieldRead.isRead ? [] : fieldRead.problems; }),
  };
}

async function importConstantsModule(constantsPath: string): Promise<ConstantsModuleImport>
{
  try
  {
    return { isImported: true, constantsModule: await import(pathToFileURL(constantsPath).href) };
  }
  catch (error)
  {
    return { isImported: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/** Imports the module at `constantsPath` and validates its default export as the score constants. Never throws. */
export async function loadScoreConstants(constantsPath: string): Promise<ScoreConstantsLoad>
{
  const constantsImport = await importConstantsModule(constantsPath);

  if (!constantsImport.isImported)
  {
    return { kind: 'unloadable', error: constantsImport.error };
  }

  if (!isRecord(constantsImport.constantsModule) || !('default' in constantsImport.constantsModule))
  {
    return { kind: 'invalid', problems: ['the module has no default export'] };
  }

  const validation = validateScoreConstants(constantsImport.constantsModule.default);

  if (!validation.isValid)
  {
    return { kind: 'invalid', problems: validation.problems };
  }

  return { kind: 'loaded', constants: validation.constants };
}

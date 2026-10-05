import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, describe, test } from 'node:test';

import exampleConstants from './example-constants.ts';
import { loadScoreConstants, validateScoreConstants } from './load-score-constants.ts';

const scratchDirectory = mkdtempSync(path.join(tmpdir(), 'ask-score-constants-'));

after(() =>
{
  rmSync(scratchDirectory, { recursive: true, force: true });
});

function writeScratchModule(fileName: string, source: string): string
{
  const modulePath = path.join(scratchDirectory, fileName);

  writeFileSync(modulePath, source);

  return modulePath;
}

describe('loadScoreConstants', () =>
{
  test('loads the default export of a constants module', async () =>
  {
    const constantsLoad = await loadScoreConstants(path.join(import.meta.dirname, 'example-constants.ts'));

    assert.deepEqual(constantsLoad, { kind: 'loaded', constants: exampleConstants });
  });

  test('reports a module that does not load', async () =>
  {
    const constantsLoad = await loadScoreConstants(path.join(scratchDirectory, 'missing.ts'));

    assert.equal(constantsLoad.kind, 'unloadable');
  });

  test('reports a module without a default export', async () =>
  {
    const modulePath = writeScratchModule('named-export.ts', 'export const constants = {};\n');
    const constantsLoad = await loadScoreConstants(modulePath);

    assert.deepEqual(constantsLoad, { kind: 'invalid', problems: ['the module has no default export'] });
  });

  test('reports the faults of invalid constants', async () =>
  {
    const modulePath = writeScratchModule('invalid.ts', 'export default { version: 0 };\n');
    const constantsLoad = await loadScoreConstants(modulePath);

    assert.equal(constantsLoad.kind, 'invalid');
    assert.ok(constantsLoad.kind === 'invalid' && constantsLoad.problems.includes('version must be a whole number above 0'));
  });
});

describe('validateScoreConstants', () =>
{
  test('accepts the example constants', () =>
  {
    assert.deepEqual(validateScoreConstants(exampleConstants), { isValid: true, constants: exampleConstants });
  });

  test('rejects a value that is no object', () =>
  {
    assert.deepEqual(validateScoreConstants(null), { isValid: false, problems: ['the constants must be an object'] });
  });

  test('lists every fault it finds, in the order of the fields', () =>
  {
    const validation = validateScoreConstants({
      ...exampleConstants,
      version: 0,
      qualityWeights: { ease: 0, convention: 0, agreement: 0, durability: 2, integrity: 2, growth: -1 },
      ratingWorthFloor: 0,
      sharpness: Number.POSITIVE_INFINITY,
      outsideOptionRating: 11,
      percentStep: 7,
    });

    assert.deepEqual(validation, {
      isValid: false,
      problems: [
        'version must be a whole number above 0',
        'qualityWeights.truth must be a number of 0 or more',
        'qualityWeights.growth must be a number of 0 or more',
        'ratingWorthFloor must be a number above 0 and at most 1',
        'sharpness must be a number above 0',
        'outsideOptionRating must be a whole number from 0 to 10',
        'percentStep must be a number above 0 that divides 100',
      ],
    });
  });
});

/**
 * worker/test/location-normalizer.test.ts
 *
 * Unit tests for the deterministic location typo-healer. The module is
 * duplicated between web (src/lib/locationNormalizer.ts) and worker
 * (worker/src/utils/location-normalizer.ts); a drift test here fails the
 * suite if the twins ever diverge.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'fs';
import * as path from 'path';
import {
  healLocation,
  healLocationToken,
  damerauLevenshtein,
} from '../src/utils/location-normalizer';

const WEB_TWIN = path.join(__dirname, '..', '..', 'src', 'lib', 'locationNormalizer.ts');
const WORKER_COPY = path.join(__dirname, '..', 'src', 'utils', 'location-normalizer.ts');

describe('location-normalizer twin drift', () => {
  it('worker twin is byte-identical to web copy', () => {
    const workerCopy = readFileSync(WORKER_COPY, 'utf8');
    const webCopy = readFileSync(WEB_TWIN, 'utf8');
    assert.strictEqual(workerCopy, webCopy, 'twins drifted; re-copy src/lib/locationNormalizer.ts');
  });
});

describe('damerauLevenshtein', () => {
  it('counts substitutions, insertions, deletions, transpositions', () => {
    assert.strictEqual(damerauLevenshtein('florida', 'florada'), 1);
    assert.strictEqual(damerauLevenshtein('massatusetts', 'massachusetts'), 2, 'ss->ts swap + s drop');
    assert.strictEqual(damerauLevenshtein('germany', 'germoney'), 2, 'a->o and n->e substitutions');
    assert.strictEqual(damerauLevenshtein('tx', 'tx'), 0);
    assert.strictEqual(damerauLevenshtein('ca', 'ac'), 1, 'transposition costs 1');
    assert.strictEqual(damerauLevenshtein('', 'abc'), 3);
  });

  it('respects the max-distance cutoff', () => {
    assert.strictEqual(damerauLevenshtein('florida', 'florada', 0), 1);
    assert.strictEqual(damerauLevenshtein('florida', 'california', 2), 3);
  });
});

describe('healLocationToken', () => {
  it('heals misspelled states within budget', () => {
    assert.strictEqual(healLocationToken('Florada'), 'Florida');
    assert.strictEqual(healLocationToken('Massatusetts'), 'Massachusetts');
    assert.strictEqual(healLocationToken('virgnia'), 'Virginia');
    assert.strictEqual(healLocationToken('conecticut'), 'Connecticut');
  });

  it('heals misspelled countries within budget', () => {
    assert.strictEqual(healLocationToken('Germoney'), 'Germany');
    assert.strictEqual(healLocationToken('Austraila'), 'Australia');
    assert.strictEqual(healLocationToken('Canda'), 'Canada');
    assert.strictEqual(healLocationToken('Nigera'), 'Nigeria');
  });

  it('canonicalizes exact names and aliases', () => {
    assert.strictEqual(healLocationToken('Florida'), 'Florida');
    assert.strictEqual(healLocationToken('florida'), 'Florida', 'case normalized');
    assert.strictEqual(healLocationToken('USA'), null, 'remote-style token untouched');
    assert.strictEqual(healLocationToken('Remote'), null);
    assert.strictEqual(healLocationToken('UK'), 'United Kingdom');
    assert.strictEqual(healLocationToken('Holland'), 'Netherlands', 'alias canonicalized');
    assert.strictEqual(healLocationToken('England'), 'United Kingdom', 'alias canonicalized');
    assert.strictEqual(healLocationToken('Deutschland'), 'Germany', 'alias canonicalized');
    assert.strictEqual(healLocationToken('Italy'), 'Italy');
  });

  it('preserves abbreviation register for short inputs', () => {
    assert.strictEqual(healLocationToken('tx'), 'TX');
    assert.strictEqual(healLocationToken('Tx'), 'TX');
    assert.strictEqual(healLocationToken('NY'), 'NY');
  });

  it('refuses ambiguous or risky tokens', () => {
    assert.strictEqual(healLocationToken('Melborne'), null, 'cities are never healed');
    assert.strictEqual(healLocationToken('fla'), null, 'short token, no budget');
    assert.strictEqual(healLocationToken('ma'), null, 'MA vs many abbrs: ambiguous');
    assert.strictEqual(healLocationToken('La'), null, 'LA is a city and an abbr');
    assert.strictEqual(healLocationToken('12345'), null, 'postal codes untouched');
    assert.strictEqual(healLocationToken('Smith'), null, 'surnames untouched');
    assert.strictEqual(healLocationToken('Wuhan'), null, 'unheard-of city untouched');
  });
});

describe('healLocation', () => {
  it('heals the incident case while leaving the city alone', () => {
    assert.strictEqual(healLocation('Melborne, Florida'), 'Melborne, Florida');
    assert.strictEqual(healLocation('Melborne, Florada'), 'Melborne, Florida');
  });

  it('capitalizes 2-letter state abbreviations in multi-part locations', () => {
    assert.strictEqual(healLocation('Boston, ma'), 'Boston, MA');
    assert.strictEqual(healLocation('Portland, or'), 'Portland, OR');
    assert.strictEqual(healLocation('New Orleans, la'), 'New Orleans, LA');
  });

  it('preserves international accented names without corruption', () => {
    assert.strictEqual(healLocation('Montréal, Canada'), 'Montréal, Canada');
    assert.strictEqual(healLocation('São Paulo, Brazil'), 'São Paulo, Brazil');
    assert.strictEqual(healLocation('Bogotá, Colombia'), 'Bogotá, Colombia');
  });

  it('heals multi-part locations independently', () => {
    assert.strictEqual(healLocation('Springfield, Massatusetts, USA'), 'Springfield, Massachusetts, USA');
    assert.strictEqual(healLocation('Munich, Germoney'), 'Munich, Germany');
    assert.strictEqual(healLocation('London, UK'), 'London, United Kingdom');
  });

  it('leaves clean and edge-case input untouched', () => {
    assert.strictEqual(healLocation('Austin, TX'), 'Austin, TX');
    assert.strictEqual(healLocation('Remote'), 'Remote');
    assert.strictEqual(healLocation(undefined), undefined);
    assert.strictEqual(healLocation(''), '');
    assert.strictEqual(healLocation('   '), '   ');
  });
});

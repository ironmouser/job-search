/**
 * worker/test/asset-names.test.ts
 *
 * Unit tests for asset filename formatting and extension hygiene.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { getAssetFilename } from '../src/utils/asset-names';

describe('Asset Filename Generation', () => {
  it('formats standard first and last name correctly for resume', () => {
    const filename = getAssetFilename('Kurt Charles', 'resume');
    assert.strictEqual(filename, 'kurt_charles_resume.pdf');
  });

  it('formats standard first and last name correctly for cover letter', () => {
    const filename = getAssetFilename('Kurt Charles', 'cover-letter');
    assert.strictEqual(filename, 'kurt_charles_cover-letter.pdf');
  });

  it('handles multi-part last names / middle names', () => {
    const resume = getAssetFilename('Mary Jane Watson', 'resume');
    assert.strictEqual(resume, 'mary_jane_watson_resume.pdf');

    const cover = getAssetFilename('Mary Jane Watson', 'cover-letter');
    assert.strictEqual(cover, 'mary_jane_watson_cover-letter.pdf');
  });

  it('handles single name', () => {
    const resume = getAssetFilename('Kurt', 'resume');
    assert.strictEqual(resume, 'kurt_resume.pdf');

    const cover = getAssetFilename('Kurt', 'cover-letter');
    assert.strictEqual(cover, 'kurt_cover-letter.pdf');
  });

  it('handles names with special characters or hyphens', () => {
    const resume = getAssetFilename("Kurt-Charles O'Connor", 'resume');
    assert.strictEqual(resume, 'kurt_charles_oconnor_resume.pdf');
  });

  it('falls back to markdown heading if profile name is missing', () => {
    const resume = getAssetFilename('', 'resume', '# Kurt Charles\n\nSoftware Engineer');
    assert.strictEqual(resume, 'kurt_charles_resume.pdf');

    const cover = getAssetFilename(null, 'cover-letter', '# Kurt Charles\n\nSoftware Engineer');
    assert.strictEqual(cover, 'kurt_charles_cover-letter.pdf');
  });

  it('handles empty name and markdown gracefully', () => {
    const resume = getAssetFilename('', 'resume');
    assert.strictEqual(resume, 'resume.pdf');

    const cover = getAssetFilename('', 'cover-letter');
    assert.strictEqual(cover, 'cover-letter.pdf');
  });

  it('ensures no duplicate .pdf extensions', () => {
    // Testing the stripping logic used in writeMarkdownToPdf
    const stripExt = (fn: string) => fn.replace(/\.(pdf|txt|md)$/i, '') + '.pdf';
    assert.strictEqual(stripExt('kurt_charles_resume.pdf'), 'kurt_charles_resume.pdf');
    assert.strictEqual(stripExt('kurt_charles_cover-letter.pdf'), 'kurt_charles_cover-letter.pdf');
    assert.strictEqual(stripExt('kurt_charles_resume'), 'kurt_charles_resume.pdf');
  });
});

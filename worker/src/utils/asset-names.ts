/**
 * worker/src/utils/asset-names.ts
 *
 * Utility functions for generating standardized filenames for resume and cover letter assets:
 * [user_firstname]_[user_lastname]_resume.pdf (example: kurt_charles_resume.pdf)
 * [user_firstname]_[user_lastname]_cover-letter.pdf (example: kurt_charles_cover-letter.pdf)
 */

export function getAssetFilename(
  profileName: string | undefined | null,
  assetType: 'resume' | 'cover-letter',
  fallbackMarkdown?: string
): string {
  let name = (profileName || '').trim();

  // If profile name is empty, attempt to extract top heading from markdown (e.g. "# Kurt Charles")
  if (!name && fallbackMarkdown) {
    const nameMatch = fallbackMarkdown.match(/^#\s+([^\n]+)/) || fallbackMarkdown.match(/^([^\n]+)/);
    if (nameMatch) {
      name = nameMatch[1].trim();
    }
  }

  // Normalize: lower-case, remove special punctuation except spaces, hyphens, and underscores
  const sanitized = name
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, '')
    .trim();

  const parts = sanitized.split(/[\s_-]+/).filter(Boolean);

  let prefix = '';
  if (parts.length >= 2) {
    const firstName = parts[0];
    const lastName = parts.slice(1).join('_');
    prefix = `${firstName}_${lastName}`;
  } else if (parts.length === 1) {
    prefix = parts[0];
  }

  const suffix = assetType === 'resume' ? 'resume.pdf' : 'cover-letter.pdf';
  return prefix ? `${prefix}_${suffix}` : suffix;
}

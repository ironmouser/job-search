/**
 * Strips extraneous scraper annotations (e.g. "(Scraped via Email)", "(Scraped)", "(via Email)")
 * from company names.
 */
export function cleanCompanyName(company?: string | null): string {
  if (!company) return '';
  return company
    .replace(/\s*\([^)]*scraped[^)]*\)/gi, '')
    .replace(/\s*\([^)]*email[^)]*\)/gi, '')
    .replace(/\s*\(via Email\)/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Cleans location string for documents and headers.
 * Returns undefined if the location is purely generic/remote/unknown
 * (e.g. "Remote", "Remote, US", "Remote/Unknown", "Workplace / Remote", "US", "USA", "Unknown", "Worldwide")
 * without an actual physical city/state or city/country.
 */
export function cleanCompanyLocation(location?: string | null): string | undefined {
  if (!location) return undefined;
  const trimmed = location.trim();
  if (!trimmed) return undefined;

  // Strip generic words like "(Remote)", "Workplace /", etc.
  const cleanStr = trimmed
    .replace(/[\(\[\{]?\s*remote\s*[\)\]\}]?/gi, '')
    .replace(/[\(\[\{]?\s*workplace\s*[\)\]\}]?/gi, '')
    .replace(/^[\s,/-]+|[\s,/-]+$/g, '')
    .trim();

  const cleanLower = cleanStr.toLowerCase();
  if (
    !cleanStr ||
    cleanLower === 'us' ||
    cleanLower === 'usa' ||
    cleanLower === 'united states' ||
    cleanLower === 'unknown' ||
    cleanLower === 'anywhere' ||
    cleanLower === 'worldwide' ||
    cleanLower === 'remote'
  ) {
    return undefined; // Leave blank if no actual city/state or city/country
  }

  return cleanStr;
}

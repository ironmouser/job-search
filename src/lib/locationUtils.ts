// Full US state name → 2-letter abbreviation
export const US_STATES: Record<string, string> = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA',
  colorado: 'CO', connecticut: 'CT', delaware: 'DE', florida: 'FL', georgia: 'GA',
  hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA',
  kansas: 'KS', kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD',
  massachusetts: 'MA', michigan: 'MI', minnesota: 'MN', mississippi: 'MS',
  missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV',
  'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
  'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK',
  oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT',
  vermont: 'VT', virginia: 'VA', washington: 'WA', 'west virginia': 'WV',
  wisconsin: 'WI', wyoming: 'WY', 'washington dc': 'DC', 'district of columbia': 'DC',
};

export const US_STATE_ABBRS = new Set(Object.values(US_STATES));

// Resolve a location string to a state abbreviation (or null)
export const extractStateAbbr = (loc: string): string | null => {
  if (!loc) return null;
  // 1. ", XX" abbreviation pattern (e.g. "Austin, TX")
  const abbrMatch = loc.match(/,\s*([A-Z]{2})\b/);
  if (abbrMatch && US_STATE_ABBRS.has(abbrMatch[1])) return abbrMatch[1];

  // 2. Full state name (possibly preceded by city: "Austin, Texas" or standalone "Texas")
  const locLower = loc.toLowerCase();
  const sortedNames = Object.keys(US_STATES).sort((a, b) => b.length - a.length);
  for (const name of sortedNames) {
    if (new RegExp(`\\b${name}\\b`).test(locLower)) {
      return US_STATES[name];
    }
  }
  return null;
};

// Returns true if a location string looks like it's in the United States
export const isUsLocation = (loc: string): boolean => {
  if (!loc) return false;
  const l = loc.toLowerCase();
  if (l.includes('united states') || l === 'us' || l === 'usa') return true;
  if (/\bus\b/.test(l)) return true;
  if (extractStateAbbr(loc) !== null) return true;
  return false;
};

// Returns true if a location string is generic US with no state or city info (e.g. "United States", "US", "USA")
export const isGenericUsLocation = (loc: string): boolean => {
  if (!loc) return false;
  if (extractStateAbbr(loc) !== null) return false;
  const l = loc.trim().toLowerCase();
  if (l === 'united states' || l === 'us' || l === 'usa' || l === 'united states of america' || l === 'u.s.' || l === 'u.s.a.') {
    return true;
  }
  const stripped = l.replace(/\b(united states|usa|us|u\.s\.a\.|u\.s\.)\b/g, '').replace(/[^a-z0-9]/g, '').trim();
  return isUsLocation(loc) && stripped.length === 0;
};

// Returns true if a location is considered Remote (including generic "United States" without state/city info)
export const isRemoteLocation = (loc: string): boolean => {
  if (!loc) return true;
  const l = loc.toLowerCase();
  if (
    l.includes('remote') ||
    l.includes('anywhere') ||
    l.includes('worldwide') ||
    l.includes('wfh') ||
    l.includes('telecommute') ||
    l.includes('distributed') ||
    l.includes('work from home')
  ) {
    return true;
  }
  // Generic "United States" with no state or city specified is also considered remote
  return isGenericUsLocation(loc);
};

// Returns true if a location string looks like it's outside the United States
export const isInternationalLocation = (loc: string): boolean => {
  if (!loc) return false;
  const locLower = loc.toLowerCase();
  if (isRemoteLocation(loc)) {
    if (isUsLocation(loc)) return false;
    const intlKeywords = ['uk', 'europe', 'canada', 'emea', 'apac', 'latam', 'germany', 'france', 'india', 'brazil', 'australia', 'japan', 'china', 'singapore', 'mexico', 'united kingdom'];
    return intlKeywords.some(k => new RegExp(`\\b${k}\\b`).test(locLower));
  }
  return !isUsLocation(loc);
};

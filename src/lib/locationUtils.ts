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
  const l = loc.toLowerCase().trim();
  if (
    l.includes('remote') ||
    l.includes('anywhere') ||
    l === 'world' ||
    l.includes('worldwide') ||
    l.includes('global') ||
    l.includes('everywhere') ||
    l.includes('any location') ||
    l.includes('wfh') ||
    l.includes('telecommute') ||
    l.includes('distributed') ||
    l.includes('work from home') ||
    l.includes('work from anywhere') ||
    l === 'international' ||
    l.includes('international')
  ) {
    return true;
  }
  // Generic "United States" with no state or city specified is also considered remote
  return isGenericUsLocation(loc);
};

// A set of globally-scoped terms that are remote but NOT US-specific.
// When a user selects US-only (noInternational), these should be excluded.
const GLOBAL_NON_US_TERMS = [
  'world',
  'worldwide',
  'anywhere',
  'anywhere in the world',
  'work from anywhere',
  'global',
  'everywhere',
  'international',
];

// Returns true if a location string looks like it's outside the United States
export const isInternationalLocation = (loc: string): boolean => {
  if (!loc) return false;
  const locLower = loc.toLowerCase().trim();

  // Global/open terms (e.g. "Anywhere", "World", "International") are not US-specific —
  // treat them as international so US-only users don't see them.
  if (GLOBAL_NON_US_TERMS.some(term => locLower === term || locLower.includes(term))) {
    // If it explicitly also mentions the US (e.g. "US or Remote"), keep it
    if (isUsLocation(loc)) return false;
    return true;
  }

  if (isRemoteLocation(loc)) {
    if (isUsLocation(loc)) return false;
    const intlKeywords = ['uk', 'europe', 'canada', 'emea', 'apac', 'latam', 'germany', 'france', 'india', 'brazil', 'australia', 'japan', 'china', 'singapore', 'mexico', 'united kingdom'];
    return intlKeywords.some(k => new RegExp(`\\b${k}\\b`).test(locLower));
  }
  return !isUsLocation(loc);
};

// Returns true if user's location preference is outside the US (excluding generic Remote)
export const isOutsideUsLocation = (loc: string): boolean => {
  if (!loc) return false;
  const trimmed = loc.trim().toLowerCase();
  if (trimmed === 'remote' || trimmed === 'remote, us' || trimmed === 'us remote' || trimmed === 'work from home' || trimmed === 'wfh') {
    return false;
  }
  return isInternationalLocation(loc);
};

// Returns true if a location explicitly represents globally open / worldwide remote
export const isWorldwideRemote = (loc: string): boolean => {
  if (!loc) return false;
  const l = loc.toLowerCase().trim();
  return GLOBAL_NON_US_TERMS.some(term => l === term || l.includes(term));
};

// Determines whether a job listing's location matches the candidate's location preference
export const matchesLocationPreference = (jobLoc: string, userLoc: string): boolean => {
  if (!userLoc || userLoc.trim() === '') return true;
  if (!jobLoc) return isRemoteLocation(userLoc);

  const userTrimmed = userLoc.trim();
  const jobTrimmed = jobLoc.trim();

  // If user wants generic Remote, any remote job matches
  if (isRemoteLocation(userTrimmed) && !extractStateAbbr(userTrimmed)) {
    return isRemoteLocation(jobTrimmed);
  }

  // If user has a US location (e.g. "Austin, TX" or state), return true for either:
  // 1) Matching local/state job, OR
  // 2) US-eligible Remote job
  if (isUsLocation(userTrimmed)) {
    const userState = extractStateAbbr(userTrimmed);
    const jobState = extractStateAbbr(jobTrimmed);

    if (userState && jobState && userState === jobState) return true;
    if (jobTrimmed.toLowerCase().includes(userTrimmed.toLowerCase())) return true;

    // US Remote matches US location preferences
    if (isRemoteLocation(jobTrimmed) && !isInternationalLocation(jobTrimmed)) {
      return true;
    }
    return false;
  }

  // If user is International (e.g. "London, UK"), return true for either:
  // 1) Direct matching international location, OR
  // 2) True worldwide / globally open remote roles
  if (isOutsideUsLocation(userTrimmed)) {
    if (jobTrimmed.toLowerCase().includes(userTrimmed.toLowerCase())) return true;
    if (isWorldwideRemote(jobTrimmed)) return true;
    return false;
  }

  return true;
};


// Shared location typo-healing. Canonical copy lives here (web); the worker
// keeps a verbatim twin at worker/src/utils/location-normalizer.ts — keep the
// two byte-identical (a drift test enforces this).
//
// Used at:
//  - profile save (src/app/api/settings/route.ts)  -> heals before persistence
//  - session context build (api/worker/.../context)-> heals rows saved pre-fix
//
// Deterministic only: bounded Damerau-Levenshtein fuzzy match against US
// states + world countries. No AI, no network. Cities are deliberately NOT
// dictionary-healed: they number in the thousands and collide across
// countries ("Melbourne" exists in Florida and Australia). City typos are
// absorbed downstream by edit-distance scoring in the worker typeahead,
// which lets the rendering widget supply the candidate list.
//
// Arbitrary proper nouns (person names, employers) are never corrected:
// unique strings cannot be safely "corrected", only guessed.

/** Bounded Damerau-Levenshtein (optimal string alignment) distance. */
export function damerauLevenshtein(a: string, b: string, max?: number): number {
  const limit = max ?? Math.max(a.length, b.length);
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  const m = a.length;
  const n = b.length;
  const d: number[][] = [];
  for (let i = 0; i <= m; i++) {
    d.push(new Array(n + 1).fill(0));
    d[i][0] = i;
  }
  for (let j = 0; j <= n; j++) d[0][j] = j;

  for (let i = 1; i <= m; i++) {
    let rowMin = d[i][0];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        v = Math.min(v, d[i - 2][j - 2] + 1);
      }
      d[i][j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > limit) return limit + 1;
  }
  return d[m][n];
}

function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Full state name -> abbreviation. Mirrors src/lib/locationUtils.ts so this
// module stays dependency-free for the worker twin.
const US_STATES: Record<string, string> = {
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

// Reverse map: abbreviation -> full name. The exact-abbreviation table.
const US_STATE_NAMES: Record<string, string> = {};
// Fuzzy dictionary: full name -> title-cased full name (keys are what edit
// distance runs against).
const US_STATE_FUZZY: Record<string, string> = {};
for (const name of Object.keys(US_STATES)) {
  const abbr = US_STATES[name];
  if (!(abbr in US_STATE_NAMES)) US_STATE_NAMES[abbr] = name;
  US_STATE_FUZZY[name] = titleCase(name);
}

// Canonical country names with common aliases folded in.
const COUNTRIES: Record<string, string> = {
  'united states': 'United States', 'united states of america': 'United States',
  usa: 'United States', us: 'United States', america: 'United States',
  'u s': 'United States',
  canada: 'Canada', mexico: 'Mexico',
  'united kingdom': 'United Kingdom', uk: 'United Kingdom', britain: 'United Kingdom',
  'great britain': 'United Kingdom', england: 'United Kingdom', scotland: 'United Kingdom',
  wales: 'United Kingdom', 'northern ireland': 'United Kingdom', ireland: 'Ireland',
  germany: 'Germany', deutschland: 'Germany', france: 'France', spain: 'Spain',
  italy: 'Italy', portugal: 'Portugal', netherlands: 'Netherlands', holland: 'Netherlands',
  belgium: 'Belgium', switzerland: 'Switzerland', austria: 'Austria', sweden: 'Sweden',
  norway: 'Norway', denmark: 'Denmark', finland: 'Finland', iceland: 'Iceland',
  poland: 'Poland', czechia: 'Czech Republic', 'czech republic': 'Czech Republic',
  romania: 'Romania', hungary: 'Hungary', bulgaria: 'Bulgaria', greece: 'Greece',
  turkey: 'Turkey', ukraine: 'Ukraine', russia: 'Russia', lithuania: 'Lithuania',
  latvia: 'Latvia', estonia: 'Estonia', slovakia: 'Slovakia', slovenia: 'Slovenia',
  croatia: 'Croatia', serbia: 'Serbia', india: 'India', bharat: 'India',
  china: 'China', japan: 'Japan', 'south korea': 'South Korea', korea: 'South Korea',
  'north korea': 'North Korea', taiwan: 'Taiwan', 'hong kong': 'Hong Kong',
  singapore: 'Singapore', malaysia: 'Malaysia', indonesia: 'Indonesia',
  thailand: 'Thailand', vietnam: 'Vietnam', philippines: 'Philippines',
  pakistan: 'Pakistan', bangladesh: 'Bangladesh', 'sri lanka': 'Sri Lanka',
  nepal: 'Nepal', australia: 'Australia', 'new zealand': 'New Zealand',
  brazil: 'Brazil', argentina: 'Argentina', chile: 'Chile', colombia: 'Colombia',
  peru: 'Peru', uruguay: 'Uruguay', venezuela: 'Venezuela', ecuador: 'Ecuador',
  'costa rica': 'Costa Rica', panama: 'Panama', guatemala: 'Guatemala',
  'south africa': 'South Africa', nigeria: 'Nigeria', kenya: 'Kenya',
  egypt: 'Egypt', morocco: 'Morocco', ghana: 'Ghana', ethiopia: 'Ethiopia',
  israel: 'Israel', 'united arab emirates': 'United Arab Emirates',
  uae: 'United Arab Emirates', 'saudi arabia': 'Saudi Arabia', qatar: 'Qatar',
  kuwait: 'Kuwait', jordan: 'Jordan', lebanon: 'Lebanon',
};

/**
 * Abbreviations that double as common words or city shorthand. Exact hits
 * through the abbr table are refused for these; a bare "ma" is far more
 * likely to be a stray fragment than a state.
 */
const AMBIGUOUS_ABBS: Record<string, true> = {
  MA: true, LA: true, IN: true, OR: true, ME: true, OK: true,
  HI: true, DE: true, AS: true, AT: true, BE: true,
};

/**
 * Edit budget by token length. Short words must match near-exactly to avoid
 * false heals ("Tex" -> Texas would be wrong; "Txe" stays untouched).
 */
function toleranceFor(len: number): number {
  if (len <= 3) return 0;
  if (len <= 7) return 1;
  return 2;
}

interface DictMatch {
  canonical: string;
  /** Set when the input was an abbreviation; emits register-preserving form. */
  abbrForm?: string;
}

/**
 * Find the unique entry matching `t` within its edit budget.
 *
 * `canonicalDict` maps dictionary key -> canonical output form. `abbrDict`
 * optionally maps abbreviation -> full name: exact abbreviation inputs
 * resolve through it directly, preserving the abbreviation in the output.
 *
 * Returns null on no hit or ambiguity (two entries tied at best distance) —
 * ambiguity means guessing, so we don't heal.
 */
function bestDictMatch(
  t: string,
  canonicalDict: Record<string, string>,
  abbrDict?: Record<string, string>
): DictMatch | null {
  const tol = toleranceFor(t.length);

  // Exact abbreviation ("tx", "TX") resolves straight through its table,
  // except for tokens too ambiguous to trust: "ma" reads as Massachusetts
  // but is also a filler word, "la" is Los Angeles, "in"/"or"/"me" are
  // English words. Fuzzy matching below still refuses them via the
  // length-3 exact-only budget.
  if (abbrDict) {
    const upper = t.toUpperCase();
    if (upper in AMBIGUOUS_ABBS) return null;
    if (upper in abbrDict && t.length <= 3) {
      return { canonical: abbrDict[upper], abbrForm: upper };
    }
  }

  let bestKey: string | null = null;
  let bestCanonical = '';
  let bestDist = Infinity;
  let ties = 0;

  for (const [key, canonical] of Object.entries(canonicalDict)) {
    const d = damerauLevenshtein(t, key, tol + 1);
    if (d > tol) continue;
    if (d < bestDist) {
      bestKey = key;
      bestCanonical = canonical;
      bestDist = d;
      ties = 0;
    } else if (d === bestDist && key !== bestKey) {
      ties++;
    }
  }

  if (!bestKey || bestDist > tol || ties > 0) return null;
  return { canonical: bestCanonical };
}

/**
 * Heal a single comma-separated token. Returns the corrected token or null
 * when the token should pass through unchanged.
 */
export function healLocationToken(token: string): string | null {
  const raw = token.trim();
  if (!raw || /\d/.test(raw)) return null;
  const t = norm(raw);

  // Remote-style and region words pass through untouched.
  if (/^(remote|worldwide|world|global|anywhere|international|emea|apac|latam|us|usa)$/.test(t)) {
    return null;
  }

  // States first: this is a US-centric product, so "Georgia" the state must
  // win over "Georgia" the country, and state typos are more costly.
  const stateHit = bestDictMatch(t, US_STATE_FUZZY, US_STATE_NAMES);
  if (stateHit) {
    if (stateHit.abbrForm) return stateHit.abbrForm;
    return titleCase(stateHit.canonical);
  }

  const countryHit = bestDictMatch(t, COUNTRIES);
  if (countryHit) return countryHit.canonical;

  return null;
}

/** Title-case a canonical multi-word name ("new hampshire" -> "New Hampshire"). */
function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Heal an entire free-text location ("Melborne, Florada" -> "Melborne, Florida").
 * Tokens with no confident dictionary hit pass through unchanged, so city
 * names and street fragments are never touched. Returns input unchanged for
 * empty/null input.
 */
export function healLocation(value?: string | null): string | undefined {
  if (!value || !value.trim()) return value ?? undefined;
  const parts = value.split(',');
  const healed = parts.map((part) => {
    const trimmed = part.trim();
    const upper = trimmed.toUpperCase();
    if (parts.length > 1 && trimmed.length === 2 && upper in AMBIGUOUS_ABBS && upper in US_STATE_NAMES) {
      return upper;
    }
    return healLocationToken(trimmed) ?? trimmed;
  });
  return healed.join(', ');
}

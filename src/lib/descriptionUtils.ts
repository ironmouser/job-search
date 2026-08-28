/**
 * Returns true only if `desc` looks like a real job description.
 * Threshold is 1000 chars — real descriptions are always at least that long.
 * A bare tracking URL (e.g. from an email link) may be hundreds of chars but
 * is not a description, so we also detect URL-only content explicitly.
 */
export function isDescriptionAdequate(desc?: string | null): boolean {
    if (!desc) return false;
    const clean = desc.trim();

    // Absolute minimum: anything under 150 chars cannot be a real job description
    if (clean.length < 150) return false;

    const lower = clean.toLowerCase();

    // Detect fallback placeholder strings generated during bulk scraping or email import
    if (
      lower.includes("click link to view full details") ||
      (lower.includes("job listing for ") && lower.includes("click link")) ||
      (lower.includes("job opportunity imported from your email") && clean.length < 500) ||
      lower.startsWith("apply at:") ||
      /^\s*job listing for .* click link to view full details/i.test(clean)
    ) {
      return false;
    }

    // "Found via email link: <url>" — the URL alone can be hundreds of chars but is not a description
    if (/found via email/i.test(clean) && clean.length < 600) return false;
    if (/position at/i.test(clean) && clean.length < 500) return false;

    // Content that is almost entirely a single URL
    if (/^https?:\/\/\S+$/.test(clean)) return false;

    // Detect auth checkpoint / login wall content & promotional recruiter marketing landers
    if (
      lower.includes("we're signing you in") ||
      lower.includes("signing you in") ||
      lower.includes("checkpoint/lg/login") ||
      lower.includes("discover people, jobs") ||
      lower.includes("remain on this page, you'll be signed in") ||
      lower.includes("sign in to view") ||
      lower.includes("login to view") ||
      lower.includes("account.ycombinator.com/authenticate") ||
      lower.includes("glassdoor recruiter") ||
      lower.includes("yes, the jobsearch sucks") ||
      lower.includes("the numbers game is a dead end") ||
      lower.includes("now the jobs find you") ||
      lower.includes("now the jobsfind you") ||
      lower.includes("try glassdoor recruiter") ||
      lower.includes("in a 2-minute chat") ||
      lower.includes("chat. match. apply.") ||
      lower.includes("we filter out the noise to serve you only the opportunities")
    ) {
      return false;
    }

    // Real descriptions >= 400 chars that pass all stub/checkpoint checks are adequate
    if (clean.length >= 400) return true;

    // For descriptions between 150 and 400 chars, verify presence of structured job content
    const hasJobStructure = 
      /[•\-\*]/.test(clean) ||
      /\b(requirement|qualification|responsibilit|skill|experience|duties|overview|about the role|contractjob|job description)\b/i.test(clean);

    return hasJobStructure;
}

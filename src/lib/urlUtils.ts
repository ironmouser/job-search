export function cleanJobUrl(rawUrl: string): string {
  try {
    // Basic normalization: remove trailing slash if present before parsing, 
    // although URL() handles it, we want consistent output.
    let urlToParse = rawUrl.trim();
    if (urlToParse.endsWith('/')) {
        urlToParse = urlToParse.slice(0, -1);
    }
    const parsed = new URL(urlToParse);
    
    // Strip common tracking query params
    const trackingParams = [
        'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 
        'ref', 'trackingid', 'trackingId', 'gh_src', 'src', 'trk', 'refId'
    ];
    trackingParams.forEach(param => parsed.searchParams.delete(param));
    
    let cleaned = parsed.toString();
    // Ensure no trailing slash for consistency in DB
    if (cleaned.endsWith('/')) {
        cleaned = cleaned.slice(0, -1);
    }
    return cleaned;
  } catch {
    return rawUrl.trim();
  }
}

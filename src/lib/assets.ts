/**
 * Resolves static image and asset URLs.
 * Static assets stored in /public are served directly by the web server.
 * Optional NEXT_PUBLIC_ASSET_PREFIX or NEXT_PUBLIC_STATIC_BASE_URL can be set if a CDN is used.
 */
export function getAssetUrl(path: string): string {
  if (!path) return '';

  // If path is already a full absolute URL or data URI, return as is
  if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('data:')) {
    return path;
  }

  const cleanPath = path.startsWith('/') ? path : `/${path}`;

  const assetPrefix =
    process.env.NEXT_PUBLIC_ASSET_PREFIX ||
    process.env.NEXT_PUBLIC_STATIC_BASE_URL;

  if (assetPrefix) {
    return `${assetPrefix.replace(/\/$/, '')}${cleanPath}`;
  }

  return cleanPath;
}

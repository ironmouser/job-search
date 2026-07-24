/**
 * Resolves static image and asset URLs.
 * Automatically checks NEXT_PUBLIC_S3_BASE_URL, NEXT_PUBLIC_AWS_S3_BUCKET_NAME,
 * NEXT_PUBLIC_S3_BUCKET_NAME, and AWS_S3_BUCKET_NAME environment variables.
 */
export function getAssetUrl(path: string): string {
  if (!path) return '';

  // If path is already a full absolute URL (http/https), return as is
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }

  const cleanPath = path.startsWith('/') ? path : `/${path}`;

  const bucketName =
    process.env.NEXT_PUBLIC_AWS_S3_BUCKET_NAME ||
    process.env.NEXT_PUBLIC_S3_BUCKET_NAME ||
    process.env.AWS_S3_BUCKET_NAME;

  const region =
    process.env.NEXT_PUBLIC_AWS_REGION ||
    process.env.AWS_REGION ||
    'us-east-1';

  const s3BaseUrl =
    process.env.NEXT_PUBLIC_S3_BASE_URL ||
    (bucketName ? `https://${bucketName}.s3.${region}.amazonaws.com` : '');

  if (s3BaseUrl) {
    return `${s3BaseUrl.replace(/\/$/, '')}${cleanPath}`;
  }

  return cleanPath;
}

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

export function isS3Configured(): boolean {
  return !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);
}

export function getS3BucketName(): string {
  return process.env.AWS_S3_BUCKET_NAME || process.env.NEXT_PUBLIC_AWS_S3_BUCKET_NAME || 'the-job-agent';
}

export function getS3Region(): string {
  return process.env.AWS_REGION || process.env.NEXT_PUBLIC_AWS_REGION || 'us-east-1';
}

let s3ClientInstance: S3Client | null = null;

function getS3Client(): S3Client | null {
  if (!isS3Configured()) {
    return null;
  }

  if (!s3ClientInstance) {
    s3ClientInstance = new S3Client({
      region: getS3Region(),
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    });
  }

  return s3ClientInstance;
}

/**
 * Uploads a Buffer (such as a PNG screenshot) to S3 and returns the public object URL.
 * Returns null if S3 credentials are not configured or if the upload fails.
 */
export async function uploadScreenshotBuffer(
  key: string,
  buffer: Buffer,
  contentType: string = 'image/png'
): Promise<string | null> {
  const client = getS3Client();
  if (!client) {
    console.info('[S3] AWS credentials not configured — using base64 data URI fallback for screenshot.');
    // Encode as data URI so screenshot proof is preserved even without S3 credentials
    return `data:${contentType};base64,${buffer.toString('base64')}`;
  }

  const bucket = getS3BucketName();
  const region = getS3Region();
  const cleanKey = key.startsWith('/') ? key.slice(1) : key;

  try {
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: cleanKey,
        Body: buffer,
        ContentType: contentType,
      })
    );

    const publicUrl = `https://${bucket}.s3.${region}.amazonaws.com/${cleanKey}`;
    return publicUrl;
  } catch (error: any) {
    console.error(`[S3] Failed to upload screenshot to ${cleanKey}:`, error?.message || error);
    return null;
  }
}

/**
 * Captures screenshot buffer from a BrowserSession and uploads directly to S3.
 */
export async function uploadBrowserScreenshot(
  browser: { screenshotBuffer: () => Promise<Buffer> },
  key: string
): Promise<string | null> {
  try {
    const buffer = await browser.screenshotBuffer();
    return await uploadScreenshotBuffer(key, buffer, 'image/png');
  } catch (error: any) {
    console.warn(`[S3] Could not capture or upload browser screenshot:`, error?.message || error);
    return null;
  }
}

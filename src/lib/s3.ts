import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

export function getS3AssetUrl(key: string): string {
  const bucket = process.env.NEXT_PUBLIC_AWS_S3_BUCKET_NAME || process.env.AWS_S3_BUCKET_NAME || 'the-job-agent';
  const region = process.env.NEXT_PUBLIC_AWS_REGION || process.env.AWS_REGION || 'us-east-1';
  const cleanKey = key.startsWith('/') ? key.slice(1) : key;
  return `https://${bucket}.s3.${region}.amazonaws.com/${cleanKey}`;
}

export async function uploadFileToS3(key: string, buffer: Buffer, contentType: string = 'image/gif'): Promise<string> {
  const bucket = process.env.AWS_S3_BUCKET_NAME || 'the-job-agent';
  const region = process.env.AWS_REGION || 'us-east-1';

  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    throw new Error('AWS credentials missing from environment variables');
  }

  const s3Client = new S3Client({
    region,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });

  const cleanKey = key.startsWith('/') ? key.slice(1) : key;

  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: cleanKey,
      Body: buffer,
      ContentType: contentType,
    })
  );

  return `https://${bucket}.s3.${region}.amazonaws.com/${cleanKey}`;
}

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

async function uploadWebmFiles() {
  const bucket = process.env.AWS_S3_BUCKET_NAME || 'the-job-agent';
  const region = process.env.AWS_REGION || 'us-east-1';

  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    console.error('Error: Missing AWS_ACCESS_KEY_ID or AWS_SECRET_ACCESS_KEY in environment.');
    process.exit(1);
  }

  const s3Client = new S3Client({
    region,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });

  const publicDir = path.join(process.cwd(), 'public');
  const files = fs.readdirSync(publicDir).filter(f => f.endsWith('.webm'));

  if (files.length === 0) {
    console.log('No .webm files found in public directory.');
    return;
  }

  console.log(`Found ${files.length} WebM files to upload: ${files.join(', ')}`);
  console.log(`Target S3 Bucket: ${bucket} (Region: ${region})\n`);

  for (const fileName of files) {
    const filePath = path.join(publicDir, fileName);
    const fileBuffer = fs.readFileSync(filePath);
    console.log(`Uploading ${fileName} (${(fileBuffer.length / 1024).toFixed(1)} KB) to s3://${bucket}/${fileName} ...`);

    try {
      await s3Client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: fileName,
          Body: fileBuffer,
          ContentType: 'video/webm',
        })
      );
      const url = `https://${bucket}.s3.${region}.amazonaws.com/${fileName}`;
      console.log(`✓ Uploaded ${fileName} -> ${url}`);
    } catch (err) {
      console.error(`✗ Failed to upload ${fileName}:`, err.message || err);
      process.exitCode = 1;
    }
  }

  console.log('\nAll WebM uploads completed!');
}

uploadWebmFiles().catch(err => {
  console.error('Error during WebM upload process:', err);
  process.exit(1);
});

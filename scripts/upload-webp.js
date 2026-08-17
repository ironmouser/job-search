const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

const WEBP_FILES = ['thumbs.webp', 'lasso.webp', 'head.webp', 'fly.webp'];

async function uploadWebpImages() {
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

  for (const fileName of WEBP_FILES) {
    const filePath = path.join(process.cwd(), 'public', fileName);
    if (!fs.existsSync(filePath)) {
      console.warn(`Warning: File not found at ${filePath}, skipping...`);
      continue;
    }

    const fileBuffer = fs.readFileSync(filePath);
    console.log(`Uploading ${fileName} (${(fileBuffer.length / 1024).toFixed(1)} KB) to s3://${bucket}/${fileName} ...`);

    try {
      await s3Client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: fileName,
          Body: fileBuffer,
          ContentType: 'image/webp',
        })
      );
      const url = `https://${bucket}.s3.${region}.amazonaws.com/${fileName}`;
      console.log(`✓ Uploaded ${fileName} -> ${url}`);
    } catch (err) {
      console.error(`✗ Failed to upload ${fileName}:`, err.message || err);
    }
  }
  console.log('All WebP uploads completed!');
}

uploadWebpImages().catch(err => {
  console.error('Error during WebP upload process:', err);
  process.exit(1);
});

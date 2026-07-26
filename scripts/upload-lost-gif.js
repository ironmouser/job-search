const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

async function uploadLostGif() {
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

  const filePath = path.join(process.cwd(), 'public', 'lost.gif');
  if (!fs.existsSync(filePath)) {
    console.error(`Error: File not found at ${filePath}`);
    process.exit(1);
  }

  const fileBuffer = fs.readFileSync(filePath);

  console.log(`Uploading ${filePath} to s3://${bucket}/lost.gif ...`);

  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: 'lost.gif',
      Body: fileBuffer,
      ContentType: 'image/gif',
    })
  );

  const url = `https://${bucket}.s3.${region}.amazonaws.com/lost.gif`;
  console.log(`Successfully uploaded lost.gif to S3: ${url}`);
}

uploadLostGif().catch(err => {
  console.error('Failed to upload lost.gif:', err);
  process.exit(1);
});

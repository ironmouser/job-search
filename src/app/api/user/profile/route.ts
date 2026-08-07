import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logSuspiciousActivity } from "@/lib/security";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { name, email, image } = await req.json();

    if (name !== undefined && (typeof name !== 'string' || name.length > 100)) {
      await logSuspiciousActivity({ type: 'PROFILE_PAYLOAD_TOO_LARGE', message: 'Name exceeds max length', userId: session.user.id, metadata: { length: name?.length } });
      return new NextResponse("Invalid name length", { status: 400 });
    }
    if (email !== undefined && email !== null && email !== "") {
      if (typeof email !== 'string' || email.length > 100 || !email.includes('@')) {
        return new NextResponse("Invalid email address", { status: 400 });
      }
    }
    let finalImageUrl = image;

    if (image !== undefined && image !== null && image !== "") {
      if (typeof image !== 'string' || (!image.startsWith('http://') && !image.startsWith('https://') && !image.startsWith('data:image/'))) {
        await logSuspiciousActivity({ type: 'PROFILE_PAYLOAD_TOO_LARGE', message: 'Image URL invalid format', userId: session.user.id, metadata: { length: image?.length } });
        return new NextResponse("Invalid image URL", { status: 400 });
      }

      // Automatically convert base64 data URIs to S3 uploads if S3 is configured
      if (image.startsWith('data:image/')) {
        if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_S3_BUCKET_NAME && process.env.AWS_SECRET_ACCESS_KEY) {
          try {
            const match = image.match(/^data:(image\/\w+);base64,(.*)$/);
            if (match) {
              const contentType = match[1];
              const buffer = Buffer.from(match[2], 'base64');
              const ext = contentType.split('/')[1] || 'jpg';
              const fileName = `avatars/${session.user.id}-${Date.now()}.${ext}`;

              const s3Client = new S3Client({
                region: process.env.AWS_REGION || 'us-east-1',
                credentials: {
                  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
                },
              });

              await s3Client.send(
                new PutObjectCommand({
                  Bucket: process.env.AWS_S3_BUCKET_NAME,
                  Key: fileName,
                  Body: buffer,
                  ContentType: contentType,
                })
              );

              finalImageUrl = `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${fileName}`;
            }
          } catch (err) {
            console.error("Failed to convert base64 avatar to S3 in profile route:", err);
          }
        }
      }

      if (finalImageUrl && finalImageUrl.length > 2000) {
        await logSuspiciousActivity({ type: 'PROFILE_PAYLOAD_TOO_LARGE', message: 'Image URL exceeds max length', userId: session.user.id, metadata: { length: finalImageUrl.length } });
        return new NextResponse("Invalid image URL length", { status: 400 });
      }
    }

    const user = await prisma.user.update({
      where: {
        id: session.user.id,
      },
      data: {
        name: name !== undefined ? name : undefined,
        email: email !== undefined && email.trim() !== '' ? email.trim() : undefined,
        image: finalImageUrl !== undefined ? (finalImageUrl === "" ? null : finalImageUrl) : undefined,
      },
    });

    return NextResponse.json(user);
  } catch (error) {
    console.error("[PROFILE_UPDATE_ERROR]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

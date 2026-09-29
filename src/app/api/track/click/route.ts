import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { IntroductionEventType } from '@prisma/client';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const introId = searchParams.get('introId');
  const targetUrl = searchParams.get('url');

  const defaultFallback = process.env.NEXTAUTH_URL || 'https://www.jobagenthq.com';

  if (!targetUrl) {
    return NextResponse.redirect(defaultFallback);
  }

  // Validate URL protocol to prevent open redirect vulnerabilities
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(targetUrl);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return NextResponse.redirect(defaultFallback);
    }
  } catch {
    return NextResponse.redirect(defaultFallback);
  }

  // If introId is present, log the click event
  if (introId) {
    try {
      const intro = await prisma.introduction.findFirst({
        where: {
          OR: [{ publicId: introId }, { id: introId }],
        },
        select: {
          id: true,
          candidateId: true,
          candidateViewedAt: true,
        },
      });

      if (intro) {
        const now = new Date();
        // 1. Record link clicked audit event
        await prisma.introductionEvent.create({
          data: {
            introductionId: intro.id,
            eventType: IntroductionEventType.LINK_CLICKED,
            actorType: 'CANDIDATE',
            actorId: intro.candidateId,
            metadata: {
              targetUrl: parsedUrl.toString(),
              clickedAt: now.toISOString(),
            },
          },
        });

        // 2. Mark candidateViewedAt if not already marked
        if (!intro.candidateViewedAt) {
          await prisma.introduction.update({
            where: { id: intro.id },
            data: { candidateViewedAt: now },
          });
        }
      }
    } catch (err) {
      console.warn('[TRACK_CLICK] Failed to log link click event:', err);
    }
  }

  return NextResponse.redirect(parsedUrl.toString(), { status: 307 });
}

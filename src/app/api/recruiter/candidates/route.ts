import { NextRequest, NextResponse } from 'next/server';
import { requireVerifiedRecruiter } from '@/lib/recruiter/auth';
import { prisma } from '@/lib/prisma';
import { isRateLimited } from '@/lib/rateLimit';
import { RECRUITER_RATE_LIMITS } from '@/lib/recruiter/config';
import { sanitizeCandidateForDiscovery } from '@/lib/recruiter/sanitizer';
import { getOrComputeCandidateIntent } from '@/lib/recruiter/intentService';
import { CandidateConsentType, ConsentStatus } from '@prisma/client';

export async function GET(req: NextRequest) {
  try {
    const recruiter = await requireVerifiedRecruiter();

    // 1. Rate Limiting Check
    const rateLimitKey = `rateLimit:recruiter-search:${recruiter.recruiterId}`;
    const rateLimit = isRateLimited(
      rateLimitKey,
      RECRUITER_RATE_LIMITS.SEARCH_MAX_HITS,
      RECRUITER_RATE_LIMITS.SEARCH_WINDOW_MS
    );

    if (rateLimit.limited) {
      return NextResponse.json(
        {
          error: 'Rate limit exceeded for candidate discovery queries. Please wait before searching again.',
          retryAfterSeconds: rateLimit.retryAfterSeconds,
        },
        { status: 429 }
      );
    }

    const { searchParams } = new URL(req.url);
    const keyword = searchParams.get('keyword')?.trim();
    const location = searchParams.get('location')?.trim();
    const remoteOnly = searchParams.get('remoteOnly') === 'true';
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const pageSize = Math.min(50, Math.max(1, parseInt(searchParams.get('pageSize') || '20', 10)));

    // 2. Discoverable Candidates Query with Hard Server-Side Privacy Boundary
    const where: any = {
      id: { not: recruiter.userId }, // Self-recruitment guard
      isDisabled: false,
      candidateConsents: {
        some: {
          consentType: CandidateConsentType.RECRUITER_DISCOVERY,
          status: ConsentStatus.GRANTED,
        },
      },
      userPreferences: {
        isNot: null,
      },
    };

    if (remoteOnly) {
      where.userPreferences.remoteOnly = true;
    }

    if (location) {
      where.userPreferences.OR = [
        { city: { contains: location, mode: 'insensitive' } },
        { state: { contains: location, mode: 'insensitive' } },
        { location: { contains: location, mode: 'insensitive' } },
      ];
    }

    if (keyword) {
      where.userPreferences.AND = [
        {
          OR: [
            { searchKeyword: { contains: keyword, mode: 'insensitive' } },
            { jobLevel: { contains: keyword, mode: 'insensitive' } },
            { profile: { contains: keyword, mode: 'insensitive' } },
          ],
        },
      ];
    }

    const [candidates, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { lastLoginAt: 'desc' },
        select: {
          id: true,
          name: true,
          userPreferences: {
            select: {
              profile: true,
              resumeMarkdown: true,
              city: true,
              state: true,
              location: true,
              remoteOnly: true,
              searchKeyword: true,
              jobLevel: true,
              expectedSalary: true,
            },
          },
        },
      }),
      prisma.user.count({ where }),
    ]);

    // 3. Convert to Privacy-Safe DTOs with Cached Intent
    const sanitizedCandidates = await Promise.all(
      candidates.map(async (candidate) => {
        const intent = await getOrComputeCandidateIntent(candidate.id);
        return sanitizeCandidateForDiscovery({
          user: candidate,
          preferences: candidate.userPreferences,
          intent,
        });
      })
    );

    return NextResponse.json({
      candidates: sanitizedCandidates,
      pagination: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (err: any) {
    const status = err.message?.startsWith('UNAUTHORIZED') ? 401 : err.message?.startsWith('FORBIDDEN') ? 403 : 500;
    return NextResponse.json({ error: err.message || 'Failed to query candidates' }, { status });
  }
}

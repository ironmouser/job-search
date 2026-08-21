import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { extractStateAbbr, isUsLocation, isRemoteLocation, US_STATE_ABBRS } from '@/lib/locationUtils';
import { isDescriptionAdequate } from '@/lib/jobFetcher';
import { detectATSFromUrl } from '@/lib/auto-apply/ats-detector-lite';
import { computeRoleMatchScore } from '@/lib/roleMatcher';
import { getUserSettings } from '@/lib/settings';
import { isBotRelatedFailure } from '@/lib/auto-apply/failure-helpers';

export const revalidate = 0;

const extractMaxSalary = (salaryStr: string | null) => {
  if (!salaryStr) return 0;
  const matches = salaryStr.match(/\$(\d{1,3}(?:,\d{3})*)/g);
  if (!matches) return 0;
  const numbers = matches.map(m => parseInt(m.replace(/[^\d]/g, ''), 10));
  return Math.max(...numbers);
};

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id;
  const { searchParams } = new URL(request.url);

  const filterParam = searchParams.get('filter') || 'all'; // all, interested, skipped, applied
  const sortParam = searchParams.get('sort') || 'score'; // score, new, salary
  const keywordFilter = searchParams.get('keyword') || '';
  const locationFilter = searchParams.get('location') || '';
  const minSalaryFilter = parseInt(searchParams.get('minSalary') || '0', 10);
  const isCustomOnly = searchParams.get('customOnly') === 'true';

  try {
    const userPrefs = await getUserSettings(userId);
    const preferUsOnly = userPrefs?.noInternational || false;

    const userJobs = await prisma.userJob.findMany({
      where: {
        userId,
        status: { not: 'deleted' }
      },
      include: {
        job: {
          include: {
            opportunityScores: { where: { userId }, select: { totalScore: true } },
            jobFeedbacks: { where: { userId }, select: { feedbackType: true } },
            autoApplySessions: { 
              where: { userId }, 
              select: { id: true, status: true, failureReason: true, failureDetails: true }, 
              orderBy: { createdAt: 'desc' }, 
              take: 5 
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 1000
    });

    const jobs = userJobs.map(uj => {
      const j = uj.job;
      const score = j.opportunityScores?.[0]?.totalScore;
      const feedback = j.jobFeedbacks?.[0]?.feedbackType;
      const hasScore = uj.status === 'scored' || (score !== undefined && score !== null);
      const sessions = j.autoApplySessions || [];
      const isAutoApplied = sessions.some((s: any) => s.status === 'applied');
      const hasRunAutoApply = sessions.length > 0;
      const hasBotFailure = sessions.some((s: any) => 
        s.status !== 'applied' && isBotRelatedFailure(s.failureReason, s.failureDetails)
      );

      return {
        id: j.id,
        title: j.title,
        company: j.company,
        location: j.location,
        salary_range: j.salaryRange,
        status: uj.status,
        is_archived: uj.isArchived,
        is_auto_applied: isAutoApplied,
        has_run_auto_apply: hasRunAutoApply,
        has_bot_failure: hasBotFailure,
        created_at: uj.createdAt,
        consecutive_auto_failures: j.consecutiveAutoFailures || 0,
        automation_confidence: isAutoApplied ? 100 : detectATSFromUrl(j.applicationUrl || j.url).confidence,
        source: j.source,
        description: j.description,
        opportunity_scores: j.opportunityScores,
        isScored: hasScore,
        isDescriptionAdequate: isDescriptionAdequate(j.description),
        feedbackType: feedback || null,
      };
    });

    let result = [...jobs];

    // Keyword Filter
    if (keywordFilter.trim()) {
      const terms = keywordFilter.toLowerCase().trim().split(/\s+/).filter(Boolean);
      result = result.filter(j => {
        const fullText = `${j.title || ''} ${j.company || ''} ${j.location || ''} ${j.description || ''}`.toLowerCase();
        return terms.every(term => fullText.includes(term));
      });
    }

    // Source Filter
    if (sourceFilter === 'email') {
      result = result.filter(j => j.company?.includes('(Scraped via Email)') || j.source?.toLowerCase().includes('email'));
    } else if (sourceFilter === 'scraped') {
      result = result.filter(j => !j.company?.includes('(Scraped via Email)') && !j.source?.toLowerCase().includes('email'));
    }

    // Date Filter
    if (startDate) {
      result = result.filter(j => new Date(j.created_at) >= new Date(startDate));
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      result = result.filter(j => new Date(j.created_at) <= end);
    }

    // Status Filter
    if (activeFilter === 'archived') {
      result = result.filter(j => j.is_archived);
    } else {
      result = result.filter(j => {
        if (j.is_archived) return false;
        const score = j.opportunity_scores?.[0]?.totalScore;
        // Auto-filter out low-match jobs (score < 25) from active feed
        if (score !== undefined && score !== null && score < 25) return false;
        return true;
      });
      if (activeFilter === 'scored') {
        result = result.filter(j => j.isScored);
      } else if (activeFilter === 'high_fit') {
        result = result.filter(j => (j.opportunity_scores?.[0]?.totalScore || 0) >= 80);
      }
    }

    // Location Filter
    if (locationFilter.length > 0) {
      result = result.filter(j => {
        if (!j.location) return false;
        return locationFilter.some(locOpt => {
          if (locOpt === 'Remote') return isRemoteLocation(j.location!);
          if (locOpt === 'United States') return isUsLocation(j.location!) && !isRemoteLocation(j.location!);
          if (locOpt === 'International') return !isUsLocation(j.location!) && !isRemoteLocation(j.location!);
          if (US_STATE_ABBRS.has(locOpt)) {
            return extractStateAbbr(j.location!) === locOpt;
          }
          return false;
        });
      });
    }

    // Sorting
    const getAiScore = (j: any): number | null => {
      const s = j.opportunity_scores?.[0]?.totalScore;
      if (typeof s === 'number' && !isNaN(s)) return s;
      return null;
    };

    result.sort((a, b) => {
      if (sortOption === 'role_match') {
        if (targetRole) {
          const matchA = computeRoleMatchScore(a.title, targetRole, a.description);
          const matchB = computeRoleMatchScore(b.title, targetRole, b.description);
          if (matchB !== matchA) return matchB - matchA;
        }
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }

      if (sortOption === 'newest') {
        const timeA = new Date(a.created_at).getTime();
        const timeB = new Date(b.created_at).getTime();
        if (timeB !== timeA) return timeB - timeA;
        if (targetRole) {
          const matchA = computeRoleMatchScore(a.title, targetRole, a.description);
          const matchB = computeRoleMatchScore(b.title, targetRole, b.description);
          if (matchB !== matchA) return matchB - matchA;
        }
        return 0;
      }

      if (sortOption === 'score_desc' || sortOption === 'score') {
        const scoreA = getAiScore(a);
        const scoreB = getAiScore(b);
        if (scoreA !== null && scoreB !== null) {
          if (scoreB !== scoreA) return scoreB - scoreA;
        } else if (scoreA !== null) {
          return -1;
        } else if (scoreB !== null) {
          return 1;
        }
      } else if (sortOption === 'score_asc') {
        const scoreA = getAiScore(a);
        const scoreB = getAiScore(b);
        if (scoreA !== null && scoreB !== null) {
          if (scoreA !== scoreB) return scoreA - scoreB;
        } else if (scoreA !== null) {
          return -1;
        } else if (scoreB !== null) {
          return 1;
        }
      } else if (sortOption === 'company') {
        const compA = (a.company || '').toLowerCase();
        const compB = (b.company || '').toLowerCase();
        const compDiff = compA.localeCompare(compB);
        if (compDiff !== 0) return compDiff;
      } else if (sortOption === 'salary_desc' || sortOption === 'salary') {
        const salA = extractMaxSalary(a.salary_range || null);
        const salB = extractMaxSalary(b.salary_range || null);
        if (salB !== salA) return salB - salA;
      } else if (sortOption === 'salary_asc') {
        const salA = extractMaxSalary(a.salary_range || null);
        const salB = extractMaxSalary(b.salary_range || null);
        if (salA !== salB) return salA - salB;
      } else if (sortOption === 'remote') {
        const isRemoteA = isRemoteLocation(a.location || '') ? 1 : 0;
        const isRemoteB = isRemoteLocation(b.location || '') ? 1 : 0;
        if (isRemoteB !== isRemoteA) return isRemoteB - isRemoteA;
      } else if (sortOption === 'auto_apply') {
        const confA = (a.consecutive_auto_failures >= 3) ? -1 : (a.automation_confidence || 0);
        const confB = (b.consecutive_auto_failures >= 3) ? -1 : (b.automation_confidence || 0);
        if (confB !== confA) return confB - confA;
      }

      // Role alignment secondary tie-breaker
      if (targetRole) {
        const matchA = computeRoleMatchScore(a.title, targetRole, a.description);
        const matchB = computeRoleMatchScore(b.title, targetRole, b.description);
        if (matchB !== matchA) return matchB - matchA;
      }

      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    const sequence = result.map(j => ({
      id: j.id,
      title: j.title,
      company: j.company,
      isScored: j.isScored,
      isDescriptionAdequate: j.isDescriptionAdequate,
      isArchived: j.is_archived,
      feedbackType: j.feedbackType
    }));

    return NextResponse.json({ sequence });
  } catch (error: any) {
    console.error('Error fetching job sequence:', error);
    return NextResponse.json({ error: 'Failed to fetch job sequence' }, { status: 500 });
  }
}

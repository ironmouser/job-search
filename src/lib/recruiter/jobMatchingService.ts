import { prisma } from '@/lib/prisma';
import { callAI } from '@/lib/ai';
import { RECRUITER_MATCH_VERSION } from './config';
import { CandidateConsentType, ConsentStatus, RecruiterMatchStatus } from '@prisma/client';

export interface RecruiterScoringResult {
  candidateId: string;
  recruiterJobId: string;
  jobFitScore: number;
  matchReasons: string[];
  matchVersion: string;
}

/**
 * Scores a single candidate against a recruiter job description using AI.
 */
export async function scoreRecruiterMatch(
  candidateId: string,
  recruiterJobId: string
): Promise<RecruiterScoringResult> {
  const [candidate, job] = await Promise.all([
    prisma.user.findUnique({
      where: { id: candidateId },
      select: {
        id: true,
        userPreferences: {
          select: {
            profile: true,
            resumeMarkdown: true,
            searchKeyword: true,
            jobLevel: true,
            remoteOnly: true,
          },
        },
      },
    }),
    prisma.recruiterJob.findUnique({
      where: { id: recruiterJobId },
    }),
  ]);

  if (!candidate || !candidate.userPreferences) {
    throw new Error(`Candidate ${candidateId} preferences not found`);
  }
  if (!job) {
    throw new Error(`Recruiter job ${recruiterJobId} not found`);
  }

  const resumeText = candidate.userPreferences.resumeMarkdown || candidate.userPreferences.profile || '';
  const jobText = job.normalizedDescription || job.description;

  const prompt = `You are an expert technical recruiting match evaluator.
Evaluate how well the candidate's resume and background matches the job requirements.

CANDIDATE BACKGROUND:
${resumeText.substring(0, 8000)}

JOB REQUIREMENTS & DESCRIPTION:
Title: ${job.title}
Seniority: ${job.seniority || 'Not specified'}
Required Skills: ${job.requiredSkills.join(', ') || 'See description'}
Location/Remote: ${job.location || 'Remote'} (${job.remoteType})
Description:
${jobText.substring(0, 8000)}

EVALUATION CRITERIA:
1. Skills & Tech Stack Alignment (40%)
2. Seniority & Scope of Experience (30%)
3. Domain / Industry Relevance (20%)
4. Work Preference & Flexibility (10%)

Output a JSON object with:
- "jobFitScore": integer between 0 and 100
- "matchReasons": array of 2-3 crisp bullet points highlighting why this candidate is a strong fit

JSON format only:
{
  "jobFitScore": 92,
  "matchReasons": [
    "Proven 7+ years of experience with React, TypeScript, and distributed systems",
    "Led cross-functional platform teams in high-growth B2B SaaS",
    "Direct experience building real-time microservices"
  ]
}`;

  let jobFitScore = 70;
  let matchReasons = ['Profile aligns with core technical requirements.'];

  try {
    const aiResponse = await callAI({
      task: 'score',
      jsonMode: true,
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 1000,
    });

    const cleaned = aiResponse.replace(/```json\s*/gi, '').replace(/```\s*$/gi, '').trim();
    const parsed = JSON.parse(cleaned);

    if (typeof parsed.jobFitScore === 'number') {
      jobFitScore = Math.max(0, Math.min(100, Math.round(parsed.jobFitScore)));
    }
    if (Array.isArray(parsed.matchReasons) && parsed.matchReasons.length > 0) {
      matchReasons = parsed.matchReasons.slice(0, 4);
    }
  } catch (err) {
    console.warn('AI scoring failed for candidate-job pair, falling back to heuristic scoring:', err);
    // Baseline heuristic
    if (candidate.userPreferences.resumeMarkdown && candidate.userPreferences.resumeMarkdown.length > 300) {
      jobFitScore = 75;
    }
  }

  // Persist to RecruiterJobMatch
  const match = await prisma.recruiterJobMatch.upsert({
    where: {
      recruiterJobId_candidateId: {
        recruiterJobId,
        candidateId,
      },
    },
    create: {
      recruiterJobId,
      candidateId,
      jobFitScore,
      matchReasons,
      matchVersion: RECRUITER_MATCH_VERSION,
      status: RecruiterMatchStatus.NEW,
      scoredAt: new Date(),
    },
    update: {
      jobFitScore,
      matchReasons,
      matchVersion: RECRUITER_MATCH_VERSION,
      scoredAt: new Date(),
    },
  });

  return {
    candidateId,
    recruiterJobId,
    jobFitScore: match.jobFitScore,
    matchReasons,
    matchVersion: RECRUITER_MATCH_VERSION,
  };
}

/**
 * Finds all eligible, opted-in candidates and runs matching for a recruiter job.
 * Self-recruitment guard: excludes requestingUserId.
 */
export async function runMatchingForJob(
  recruiterJobId: string,
  requestingUserId: string,
  limit: number = 25
): Promise<RecruiterScoringResult[]> {
  // 1. Query discoverable candidates
  const eligibleCandidates = await prisma.user.findMany({
    where: {
      id: { not: requestingUserId }, // Self-recruitment guard
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
    },
    select: {
      id: true,
      userPreferences: {
        select: {
          resumeMarkdown: true,
          profile: true,
        },
      },
    },
    take: limit,
  });

  const results: RecruiterScoringResult[] = [];

  for (const candidate of eligibleCandidates) {
    if (!candidate.userPreferences?.resumeMarkdown && !candidate.userPreferences?.profile) {
      continue;
    }

    try {
      const matchResult = await scoreRecruiterMatch(candidate.id, recruiterJobId);
      results.push(matchResult);
    } catch (err) {
      console.error(`Failed to score candidate ${candidate.id} for job ${recruiterJobId}:`, err);
    }
  }

  // Sort highest score first
  results.sort((a, b) => b.jobFitScore - a.jobFitScore);
  return results;
}

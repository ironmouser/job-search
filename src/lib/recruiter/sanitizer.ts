import { prisma } from '@/lib/prisma';
import { MatchIntentLevel } from '@prisma/client';
import { PublicIntentDTO } from './intentService';

export interface DiscoveryCandidateDTO {
  id: string;
  displayName: string;
  headline?: string;
  currentRole?: string;
  yearsOfExperience?: number;
  skills: string[];
  location?: string;
  remotePreference?: string;
  expectedSalaryRange?: string;
  professionalSummary?: string;
  highlights: string[];
  jobFitScore?: number;
  matchReasons?: string[];
  intent: PublicIntentDTO;
}

export interface RevealedContactDTO {
  introductionId: string;
  candidateId: string;
  fullName: string;
  email: string;
  phone?: string | null;
  linkedinUrl?: string | null;
  sharedAt: Date;
}

/**
 * Creates a sanitized, privacy-safe discovery view of a candidate.
 * Never includes raw emails, phone numbers, exact addresses, or proprietary tracking fields.
 */
export function sanitizeCandidateForDiscovery(params: {
  user: {
    id: string;
    name?: string | null;
  };
  preferences?: {
    profile?: string | null;
    resumeMarkdown?: string | null;
    city?: string | null;
    state?: string | null;
    location?: string | null;
    remoteOnly?: boolean | null;
    searchKeyword?: string | null;
    jobLevel?: string | null;
    expectedSalary?: string | null;
  } | null;
  match?: {
    jobFitScore: number;
    matchReasons?: any;
  } | null;
  intent: PublicIntentDTO;
}): DiscoveryCandidateDTO {
  const { user, preferences, match, intent } = params;

  // Format privacy-safe display name (e.g. "Sarah M.")
  let displayName = 'Candidate';
  if (user.name && user.name.trim().length > 0) {
    const parts = user.name.trim().split(/\s+/);
    if (parts.length === 1) {
      displayName = parts[0];
    } else {
      const first = parts[0];
      const lastInitial = parts[parts.length - 1][0]?.toUpperCase();
      displayName = `${first} ${lastInitial}.`;
    }
  }

  // Location formatting
  let location = 'United States';
  if (preferences?.city && preferences?.state) {
    location = `${preferences.city}, ${preferences.state}`;
  } else if (preferences?.location) {
    location = preferences.location;
  }

  const remotePref = preferences?.remoteOnly ? 'Remote Only' : 'Flexible / Hybrid / Remote';

  // Extract skills and highlights from resume or profile safely
  const skills: string[] = [];
  const highlights: string[] = [];

  if (preferences?.searchKeyword) {
    skills.push(preferences.searchKeyword);
  }

  let matchReasons: string[] = [];
  if (match?.matchReasons) {
    if (Array.isArray(match.matchReasons)) {
      matchReasons = match.matchReasons.filter((r) => typeof r === 'string');
    } else if (typeof match.matchReasons === 'object') {
      matchReasons = Object.values(match.matchReasons).filter((r) => typeof r === 'string') as string[];
    }
  }

  return {
    id: user.id,
    displayName,
    headline: preferences?.searchKeyword || preferences?.jobLevel || 'Experienced Professional',
    currentRole: preferences?.searchKeyword || undefined,
    skills,
    location,
    remotePreference: remotePref,
    expectedSalaryRange: preferences?.expectedSalary || undefined,
    professionalSummary: preferences?.profile?.substring(0, 300) || undefined,
    highlights,
    jobFitScore: match?.jobFitScore,
    matchReasons: matchReasons.length > 0 ? matchReasons : undefined,
    intent,
  };
}

/**
 * Validates permission and retrieves private contact information for an accepted introduction.
 */
export async function getRevealedCandidateContact(
  introductionId: string,
  requesterRecruiterId: string
): Promise<RevealedContactDTO> {
  const intro = await prisma.introduction.findUnique({
    where: { id: introductionId },
    include: {
      candidate: {
        select: {
          id: true,
          name: true,
          email: true,
          userPreferences: {
            select: {
              phone: true,
              linkedinUrl: true,
            },
          },
        },
      },
      recruiter: {
        select: {
          id: true,
          organizationId: true,
        },
      },
    },
  });

  if (!intro) {
    throw new Error('NOT_FOUND: Introduction does not exist');
  }

  // Authorization check
  if (intro.recruiterId !== requesterRecruiterId) {
    throw new Error('FORBIDDEN: You do not have permission to view contact for this introduction');
  }

  // Acceptance / state check
  if (intro.currentStatus !== 'ACCEPTED' && intro.currentStatus !== 'CONTACT_SHARED' && !intro.acceptedAt) {
    throw new Error('FORBIDDEN: Contact information is only accessible after candidate acceptance');
  }

  if (!intro.candidate.email) {
    throw new Error('Candidate contact information is currently unavailable');
  }

  return {
    introductionId: intro.id,
    candidateId: intro.candidate.id,
    fullName: intro.candidate.name || 'Candidate',
    email: intro.candidate.email,
    phone: intro.candidate.userPreferences?.phone || null,
    linkedinUrl: intro.candidate.userPreferences?.linkedinUrl || null,
    sharedAt: intro.contactSharedAt || intro.acceptedAt || new Date(),
  };
}

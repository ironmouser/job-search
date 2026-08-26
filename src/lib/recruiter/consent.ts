import { prisma } from '@/lib/prisma';
import { CandidateConsentType, ConsentStatus, ConsentEventType } from '@prisma/client';

export interface ConsentRecordDTO {
  consentType: CandidateConsentType;
  status: ConsentStatus;
  policyVersion: string;
  grantedAt: Date | null;
  revokedAt: Date | null;
}

/**
 * Checks if a candidate is discoverable by recruiters.
 * Must have an active RECRUITER_DISCOVERY consent record with status GRANTED.
 * Account must not be disabled.
 */
export async function isCandidateDiscoverable(candidateId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: candidateId },
    select: {
      isDisabled: true,
      candidateConsents: {
        where: {
          consentType: CandidateConsentType.RECRUITER_DISCOVERY,
          status: ConsentStatus.GRANTED,
        },
        select: { id: true },
      },
    },
  });

  if (!user || user.isDisabled) {
    return false;
  }

  return user.candidateConsents.length > 0;
}

/**
 * Retrieves all current consents for a candidate.
 */
export async function getCandidateConsents(candidateId: string): Promise<ConsentRecordDTO[]> {
  const records = await prisma.candidateConsent.findMany({
    where: { candidateId },
    select: {
      consentType: true,
      status: true,
      policyVersion: true,
      grantedAt: true,
      revokedAt: true,
    },
  });

  return records;
}

/**
 * Grants or reactivates a candidate consent, appending an immutable audit event.
 */
export async function grantCandidateConsent(params: {
  candidateId: string;
  consentType: CandidateConsentType;
  policyVersion?: string;
  source?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, any>;
}) {
  const policyVersion = params.policyVersion || '1.0';
  const now = new Date();

  const consent = await prisma.candidateConsent.upsert({
    where: {
      candidateId_consentType: {
        candidateId: params.candidateId,
        consentType: params.consentType,
      },
    },
    create: {
      candidateId: params.candidateId,
      consentType: params.consentType,
      status: ConsentStatus.GRANTED,
      policyVersion,
      grantedAt: now,
      source: params.source || 'settings',
      metadata: params.metadata,
    },
    update: {
      status: ConsentStatus.GRANTED,
      policyVersion,
      grantedAt: now,
      revokedAt: null,
      source: params.source || 'settings',
      metadata: params.metadata,
    },
  });

  // Append audit event (fail-safe)
  try {
    await prisma.consentEvent.create({
      data: {
        candidateId: params.candidateId,
        consentId: consent.id,
        eventType: ConsentEventType.GRANTED,
        policyVersion,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
        metadata: params.metadata,
      },
    });
  } catch (err) {
    console.error('Failed to append consent event log:', err);
  }

  return consent;
}

/**
 * Revokes a candidate consent, preserving historical records and appending an audit event.
 */
export async function revokeCandidateConsent(params: {
  candidateId: string;
  consentType: CandidateConsentType;
  policyVersion?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, any>;
}) {
  const policyVersion = params.policyVersion || '1.0';
  const now = new Date();

  const consent = await prisma.candidateConsent.upsert({
    where: {
      candidateId_consentType: {
        candidateId: params.candidateId,
        consentType: params.consentType,
      },
    },
    create: {
      candidateId: params.candidateId,
      consentType: params.consentType,
      status: ConsentStatus.REVOKED,
      policyVersion,
      revokedAt: now,
      source: 'settings',
    },
    update: {
      status: ConsentStatus.REVOKED,
      revokedAt: now,
    },
  });

  // Append audit event (fail-safe)
  try {
    await prisma.consentEvent.create({
      data: {
        candidateId: params.candidateId,
        consentId: consent.id,
        eventType: ConsentEventType.REVOKED,
        policyVersion,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
        metadata: params.metadata,
      },
    });
  } catch (err) {
    console.error('Failed to append consent revocation event log:', err);
  }

  return consent;
}

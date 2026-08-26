import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-helpers';
import { getCandidateConsents, grantCandidateConsent, revokeCandidateConsent } from '@/lib/recruiter/consent';
import { CandidateConsentType } from '@prisma/client';

export async function GET() {
  const { user, error } = await requireAuth();
  if (error || !user) return error;

  try {
    const consents = await getCandidateConsents(user.id);
    const discoveryConsent = consents.find((c) => c.consentType === CandidateConsentType.RECRUITER_DISCOVERY);
    const resumeSharingConsent = consents.find((c) => c.consentType === CandidateConsentType.RESUME_SHARING);
    const contactSharingConsent = consents.find((c) => c.consentType === CandidateConsentType.CONTACT_INFORMATION_SHARING);

    return NextResponse.json({
      isDiscoverable: discoveryConsent?.status === 'GRANTED',
      shareResume: resumeSharingConsent?.status === 'GRANTED',
      shareContactOnAccept: contactSharingConsent?.status === 'GRANTED',
      consents,
    });
  } catch (err: any) {
    console.error('Failed to get candidate visibility settings:', err);
    return NextResponse.json({ error: 'Failed to retrieve visibility settings' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const { user, error } = await requireAuth();
  if (error || !user) return error;

  try {
    const body = await req.json();
    const { isDiscoverable, shareResume, shareContactOnAccept } = body;

    const ipAddress = req.headers.get('x-forwarded-for') || undefined;
    const userAgent = req.headers.get('user-agent') || undefined;

    if (typeof isDiscoverable === 'boolean') {
      if (isDiscoverable) {
        await grantCandidateConsent({
          candidateId: user.id,
          consentType: CandidateConsentType.RECRUITER_DISCOVERY,
          ipAddress,
          userAgent,
        });
      } else {
        await revokeCandidateConsent({
          candidateId: user.id,
          consentType: CandidateConsentType.RECRUITER_DISCOVERY,
          ipAddress,
          userAgent,
        });
      }
    }

    if (typeof shareResume === 'boolean') {
      if (shareResume) {
        await grantCandidateConsent({
          candidateId: user.id,
          consentType: CandidateConsentType.RESUME_SHARING,
          ipAddress,
          userAgent,
        });
      } else {
        await revokeCandidateConsent({
          candidateId: user.id,
          consentType: CandidateConsentType.RESUME_SHARING,
          ipAddress,
          userAgent,
        });
      }
    }

    if (typeof shareContactOnAccept === 'boolean') {
      if (shareContactOnAccept) {
        await grantCandidateConsent({
          candidateId: user.id,
          consentType: CandidateConsentType.CONTACT_INFORMATION_SHARING,
          ipAddress,
          userAgent,
        });
      } else {
        await revokeCandidateConsent({
          candidateId: user.id,
          consentType: CandidateConsentType.CONTACT_INFORMATION_SHARING,
          ipAddress,
          userAgent,
        });
      }
    }

    const updatedConsents = await getCandidateConsents(user.id);
    const discovery = updatedConsents.find((c) => c.consentType === CandidateConsentType.RECRUITER_DISCOVERY);

    return NextResponse.json({
      success: true,
      isDiscoverable: discovery?.status === 'GRANTED',
      consents: updatedConsents,
    });
  } catch (err: any) {
    console.error('Failed to update candidate visibility:', err);
    return NextResponse.json({ error: 'Failed to update visibility settings' }, { status: 500 });
  }
}

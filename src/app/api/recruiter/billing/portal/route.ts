import { NextResponse } from 'next/server';
import { requireVerifiedRecruiter } from '@/lib/recruiter/auth';
import { prisma } from '@/lib/prisma';
import { stripe } from '@/lib/stripe';

export async function POST() {
  try {
    const recruiter = await requireVerifiedRecruiter();

    const org = await prisma.recruiterOrganization.findUnique({
      where: { id: recruiter.organizationId },
    });

    if (!org || !org.stripeCustomerId) {
      return NextResponse.json(
        { error: 'No active Stripe billing customer found for this organization' },
        { status: 404 }
      );
    }

    const appUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: org.stripeCustomerId,
      return_url: `${appUrl}/recruiter/billing`,
    });

    return NextResponse.json({ url: portalSession.url });
  } catch (error: any) {
    console.error('[RECRUITER_STRIPE_PORTAL]', error);
    const status = error.message?.startsWith('UNAUTHORIZED') ? 401 : error.message?.startsWith('FORBIDDEN') ? 403 : 500;
    return NextResponse.json({ error: error.message || 'Failed to generate billing portal session' }, { status });
  }
}

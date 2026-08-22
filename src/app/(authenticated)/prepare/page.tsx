import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';
import { getEffectiveTier } from '@/lib/tier';
import { getUserSettings } from '@/lib/settings';
import PrepareApplicationFlow from '@/components/PrepareApplicationFlow';

export const revalidate = 0;

export default async function PreparePage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect('/dashboard');
  }

  const userId = session.user.id;
  const userRecord = await prisma.user.findUnique({
    where: { id: userId },
    select: { planTier: true, trialEndsAt: true, subscriptionType: true, orgAccessExpiresAt: true }
  });

  const effectiveTier = userRecord ? getEffectiveTier(userRecord) : 'FREE';
  const userPrefs = await getUserSettings(userId);
  const hasBaseResume = Boolean(
    userPrefs?.resumeMarkdown && 
    userPrefs.resumeMarkdown.trim().length > 30 && 
    !userPrefs.resumeMarkdown.startsWith('# Candidate Profile')
  );

  return (
    <PrepareApplicationFlow
      userPlanTier={effectiveTier}
      hasBaseResume={hasBaseResume}
    />
  );
}

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || (session.user as any).role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let settings = await prisma.globalSettings.findUnique({
      where: { id: 'system' }
    });

    if (!settings) {
      settings = await prisma.globalSettings.create({
        data: { id: 'system' }
      });
    }

    return NextResponse.json(settings);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || (session.user as any).role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const data = await request.json();

    const settings = await prisma.globalSettings.upsert({
      where: { id: 'system' },
      update: {

        greenhouseIsPro: data.greenhouseIsPro,
        leverIsPro: data.leverIsPro,
        ashbyIsPro: data.ashbyIsPro,
        workableIsPro: data.workableIsPro,
        smartrecruitersIsPro: data.smartrecruitersIsPro,
        breezyIsPro: data.breezyIsPro,
        remotiveIsPro: data.remotiveIsPro,
        weworkremotelyIsPro: data.weworkremotelyIsPro,
        remotecoIsPro: data.remotecoIsPro,
        remoteokIsPro: data.remoteokIsPro,
        workingnomadsIsPro: data.workingnomadsIsPro,
        emailsSyncIsPro: data.emailsSyncIsPro,
        aiOpportunityScoringIsPro: data.aiOpportunityScoringIsPro,
        aiAssetGenerationIsPro: data.aiAssetGenerationIsPro,
        aiQaHelperIsPro: data.aiQaHelperIsPro,
      },
      create: {
        id: 'system',

        greenhouseIsPro: data.greenhouseIsPro ?? true,
        leverIsPro: data.leverIsPro ?? false,
        ashbyIsPro: data.ashbyIsPro ?? false,
        workableIsPro: data.workableIsPro ?? true,
        smartrecruitersIsPro: data.smartrecruitersIsPro ?? true,
        breezyIsPro: data.breezyIsPro ?? true,
        remotiveIsPro: data.remotiveIsPro ?? true,
        weworkremotelyIsPro: data.weworkremotelyIsPro ?? false,
        remotecoIsPro: data.remotecoIsPro ?? false,
        remoteokIsPro: data.remoteokIsPro ?? false,
        workingnomadsIsPro: data.workingnomadsIsPro ?? false,
        emailsSyncIsPro: data.emailsSyncIsPro ?? true,
        aiOpportunityScoringIsPro: data.aiOpportunityScoringIsPro ?? true,
        aiAssetGenerationIsPro: data.aiAssetGenerationIsPro ?? true,
        aiQaHelperIsPro: data.aiQaHelperIsPro ?? true,
      }
    });

    return NextResponse.json(settings);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

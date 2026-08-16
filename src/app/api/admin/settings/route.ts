import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || (session.user as any).role !== 'SYSTEM_ADMIN') {
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
    if (!session?.user || (session.user as any).role !== 'SYSTEM_ADMIN') {
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
        workdayIsPro: data.workdayIsPro,
        taleoIsPro: data.taleoIsPro,
        icimsIsPro: data.icimsIsPro,

        linkedinIsPro: data.linkedinIsPro,
        indeedIsPro: data.indeedIsPro,
        glassdoorIsPro: data.glassdoorIsPro,
        ziprecruiterIsPro: data.ziprecruiterIsPro,
        diceIsPro: data.diceIsPro,

        remotiveIsPro: data.remotiveIsPro,
        remoteokIsPro: data.remoteokIsPro,
        workingnomadsIsPro: data.workingnomadsIsPro,
        remotepocIsPro: data.remotepocIsPro,
        weworkremotelyIsPro: data.weworkremotelyIsPro,
        nodeskIsPro: data.nodeskIsPro,
        ottaIsPro: data.ottaIsPro,
        himalayasIsPro: data.himalayasIsPro,

        arbeitnowIsPro: data.arbeitnowIsPro,
        themuseIsPro: data.themuseIsPro,
        computrabajoIsPro: data.computrabajoIsPro,
        jobbankIsPro: data.jobbankIsPro,

        emailsSyncIsPro: data.emailsSyncIsPro,
        aiOpportunityScoringIsPro: data.aiOpportunityScoringIsPro,
        aiAssetGenerationIsPro: data.aiAssetGenerationIsPro,
        aiQaHelperIsPro: data.aiQaHelperIsPro,
      },
      create: {
        id: 'system',

        greenhouseIsPro: data.greenhouseIsPro ?? false,
        leverIsPro: data.leverIsPro ?? true,
        ashbyIsPro: data.ashbyIsPro ?? true,
        workableIsPro: data.workableIsPro ?? true,
        smartrecruitersIsPro: data.smartrecruitersIsPro ?? true,
        breezyIsPro: data.breezyIsPro ?? true,
        workdayIsPro: data.workdayIsPro ?? true,
        taleoIsPro: data.taleoIsPro ?? true,
        icimsIsPro: data.icimsIsPro ?? true,

        linkedinIsPro: data.linkedinIsPro ?? false,
        indeedIsPro: data.indeedIsPro ?? true,
        glassdoorIsPro: data.glassdoorIsPro ?? true,
        ziprecruiterIsPro: data.ziprecruiterIsPro ?? true,
        diceIsPro: data.diceIsPro ?? true,

        remotiveIsPro: data.remotiveIsPro ?? false,
        remoteokIsPro: data.remoteokIsPro ?? true,
        workingnomadsIsPro: data.workingnomadsIsPro ?? true,
        remotepocIsPro: data.remotepocIsPro ?? false,
        weworkremotelyIsPro: data.weworkremotelyIsPro ?? true,
        nodeskIsPro: data.nodeskIsPro ?? false,
        ottaIsPro: data.ottaIsPro ?? true,
        himalayasIsPro: data.himalayasIsPro ?? true,

        arbeitnowIsPro: data.arbeitnowIsPro ?? true,
        themuseIsPro: data.themuseIsPro ?? true,
        computrabajoIsPro: data.computrabajoIsPro ?? true,
        jobbankIsPro: data.jobbankIsPro ?? true,

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

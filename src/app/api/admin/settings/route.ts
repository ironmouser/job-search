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
        jsearchIsPro: data.jsearchIsPro,
        emailsSyncIsPro: data.emailsSyncIsPro,
        aiFeaturesIsPro: data.aiFeaturesIsPro,
      },
      create: {
        id: 'system',
        jsearchIsPro: data.jsearchIsPro ?? true,
        emailsSyncIsPro: data.emailsSyncIsPro ?? true,
        aiFeaturesIsPro: data.aiFeaturesIsPro ?? true,
      }
    });

    return NextResponse.json(settings);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

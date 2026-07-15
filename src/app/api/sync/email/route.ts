import { NextResponse } from 'next/server';
import { fetchEmailsAndExtractJobs } from '@/lib/email';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const newJobsCount = await fetchEmailsAndExtractJobs(session.user.id);
    return NextResponse.json({ success: true, count: newJobsCount });
  } catch (error: any) {
    console.error('Error syncing emails:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to sync emails' },
      { status: 500 }
    );
  }
}

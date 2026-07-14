import { NextResponse } from 'next/server';
import { fetchEmailsAndExtractJobs } from '@/lib/email';

export async function POST() {
  try {
    const newJobsCount = await fetchEmailsAndExtractJobs();
    return NextResponse.json({ success: true, count: newJobsCount });
  } catch (error: any) {
    console.error('Error syncing emails:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to sync emails' },
      { status: 500 }
    );
  }
}

import { supabase } from '@/lib/supabase';
import { ExternalLink } from 'lucide-react';
import Link from 'next/link';
import SyncButton from '@/components/SyncButton';
import DashboardClient from '@/components/DashboardClient';

export const revalidate = 0; // Disable static caching for real-time dashboard

export default async function Dashboard() {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thirtyDaysAgoIso = thirtyDaysAgo.toISOString();

  // Fetch jobs and their scores
  const { data: rawJobs, error } = await supabase
    .from('jobs')
    .select(`
      *,
      opportunity_scores (
        total_score
      ),
      job_feedback (
        feedback_type
      )
    `)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    console.error('Error fetching jobs:', JSON.stringify(error, null, 2), error.message, error.details, error.hint);
  }

  // Filter in memory to prevent breaking due to Supabase schema cache
  const jobs = (rawJobs || []).filter(j => {
    if (j.is_archived) return true;
    return new Date(j.created_at) >= thirtyDaysAgo;
  });

  // Calculate some stats
  const totalDiscovered = jobs?.length || 0;
  const totalScored = jobs?.filter(j => j.status !== 'discovered').length || 0;
  const highlyScored = jobs?.filter(j => j.opportunity_scores?.[0]?.total_score >= 80).length || 0;

  return (
    <DashboardClient jobs={jobs || []} />
  );
}

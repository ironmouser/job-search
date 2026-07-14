import { supabase } from '@/lib/supabase';
import PipelineBoard from './PipelineBoard';

export const revalidate = 0; // Prevent caching for real-time updates

export default async function PipelinePage() {
  const { data: jobs, error } = await supabase
    .from('jobs')
    .select('id, title, company, status, location, salary_range, applied_at')
    .in('status', ['applied', 'interviewing', 'offer', 'rejected'])
    .order('applied_at', { ascending: false, nullsFirst: false });

  if (error) {
    console.error('Failed to fetch pipeline jobs:', error);
  }

  return (
    <div className="animate-fade-in" style={{ paddingBottom: '4rem', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ marginBottom: '2rem' }}>
        <h1 className="page-title">Active Pipeline</h1>
        <p className="page-subtitle">Track your ongoing applications and interviews</p>
      </div>

      <PipelineBoard initialJobs={jobs || []} />
    </div>
  );
}

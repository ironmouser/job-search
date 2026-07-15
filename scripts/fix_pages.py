import os

def replace_in_file(filepath, replacements):
    with open(filepath, 'r') as f:
        content = f.read()
    
    for old, new in replacements.items():
        content = content.replace(old, new)
        
    with open(filepath, 'w') as f:
        f.write(content)

# Actions
replace_in_file('src/app/job/[id]/actions.ts', {
    "import { supabase } from '@/lib/supabase';": "import { prisma } from '@/lib/prisma';",
    """        const { error } = await supabase
            .from('job_feedback')
            .upsert({
                job_id: jobId,
                feedback_type: feedbackType,
                reasons: reasons
            }, { onConflict: 'job_id' });

        if (error) {
            console.error('Failed to submit feedback:', error);
            return { success: false, error: error.message };
        }""": """        await prisma.jobFeedback.upsert({
            where: { jobId: jobId },
            update: { feedbackType: feedbackType, reasons: reasons },
            create: { jobId: jobId, feedbackType: feedbackType, reasons: reasons }
        });"""
})

# App Page
replace_in_file('src/app/page.tsx', {
    "import { supabase } from '@/lib/supabase';": "import { prisma } from '@/lib/prisma';",
    """  const { data: rawJobs, error } = await supabase
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
  }""": """  let rawJobs: any[] = [];
  try {
    rawJobs = await prisma.job.findMany({
      include: {
        opportunityScores: { select: { totalScore: true } },
        jobFeedbacks: { select: { feedbackType: true } }
      },
      orderBy: { createdAt: 'desc' },
      take: 100
    });
  } catch (error: any) {
    console.error('Error fetching jobs:', error);
  }""",
    "j.is_archived": "j.isArchived",
    "j.created_at": "j.createdAt",
    "j.opportunity_scores?.[0]?.total_score": "j.opportunityScores?.[0]?.totalScore"
})

# Pipeline Page
replace_in_file('src/app/pipeline/page.tsx', {
    "import { supabase } from '@/lib/supabase';": "import { prisma } from '@/lib/prisma';",
    """  const { data: jobs, error } = await supabase
    .from('jobs')
    .select('id, title, company, status, location, salary_range, applied_at')
    .in('status', ['applied', 'interviewing', 'offer', 'rejected'])
    .order('applied_at', { ascending: false, nullsFirst: false });

  if (error) {
    console.error('Failed to fetch pipeline jobs:', error);
  }""": """  let jobs: any[] = [];
  try {
    jobs = await prisma.job.findMany({
      where: { status: { in: ['applied', 'interviewing', 'offer', 'rejected'] } },
      select: { id: true, title: true, company: true, status: true, location: true, salaryRange: true, appliedAt: true },
      orderBy: { appliedAt: 'desc' }
    });
  } catch (error: any) {
    console.error('Failed to fetch pipeline jobs:', error);
  }"""
})

# Job ID Page
replace_in_file('src/app/job/[id]/page.tsx', {
    "import { supabase } from '@/lib/supabase';": "import { prisma } from '@/lib/prisma';",
    """  const { data: job, error } = await supabase
    .from('jobs')
    .select(`
      *,
      opportunity_scores (*),
      application_assets (*),
      job_feedback (*)
    `)
    .eq('id', id)
    .single();

  if (error || !job) {
    notFound();
  }""": """  const job = await prisma.job.findUnique({
    where: { id: id },
    include: { opportunityScores: true, applicationAssets: true, jobFeedbacks: true }
  });

  if (!job) {
    notFound();
  }""",
    "job.opportunity_scores": "job.opportunityScores",
    "job.application_assets": "job.applicationAssets",
    "job.job_feedback": "job.jobFeedbacks",
    "scores?.total_score": "scores?.totalScore",
    "feedback?.feedback_type": "feedback?.feedbackType",
    "job.salary_range": "job.salaryRange",
    "job.applied_at": "job.appliedAt",
    "assets.networking_message": "assets.networkingMessage",
    "assets.cover_letter_markdown": "assets.coverLetterMarkdown",
    "assets.tailored_resume_markdown": "assets.tailoredResumeMarkdown",
    "assets.portfolio_recommendation": "assets.portfolioRecommendation",
    "scores.product_fit_score": "scores.productFitScore",
    "scores.compensation_score": "scores.compensationScore",
    "scores.remote_flexibility_score": "scores.remoteFlexibilityScore",
    "scores.ai_maturity_score": "scores.aiMaturityScore",
    "scores.leadership_score": "scores.leadershipScore",
    "scores.growth_score": "scores.growthScore",
    "scores.culture_score": "scores.cultureScore",
    "scores.tech_stack_score": "scores.techStackScore",
    "scores.analysis_notes": "scores.analysisNotes",
})

print("Done")

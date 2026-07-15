import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from '@/lib/prisma';
import DashboardClient from '@/components/DashboardClient';

export const revalidate = 0;

export default async function Dashboard() {
  const session = await getServerSession(authOptions);
  
  if (!session?.user?.id) {
    return (
      <div style={{ textAlign: 'center', padding: '4rem 2rem' }}>
        <h1 className="page-title">Welcome to Job Agent</h1>
        <p className="page-subtitle">Please log in to view your dashboard.</p>
      </div>
    );
  }

  const userId = session.user.id;
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  let userJobs: any[] = [];
  try {
    userJobs = await prisma.userJob.findMany({
      where: { userId },
      include: {
        job: {
          include: {
            opportunityScores: { where: { userId }, select: { totalScore: true } },
            jobFeedbacks: { where: { userId }, select: { feedbackType: true } }
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 100
    });
  } catch (error: any) {
    console.error('Error fetching jobs:', error);
  }

  const jobs = userJobs.map(uj => {
    const j = uj.job;
    return {
      id: j.id,
      title: j.title,
      company: j.company,
      location: j.location,
      salary_range: j.salaryRange,
      url: j.url,
      description: j.description,
      
      status: uj.status,
      is_archived: uj.isArchived,
      created_at: uj.createdAt,
      applied_at: uj.appliedAt,

      opportunity_scores: j.opportunityScores.map((s: any) => ({ total_score: s.totalScore })),
      job_feedback: j.jobFeedbacks.map((f: any) => ({ feedback_type: f.feedbackType }))
    };
  }).filter(j => {
    if (j.is_archived) return true;
    return new Date(j.created_at) >= thirtyDaysAgo;
  });

  return (
    <DashboardClient jobs={jobs} />
  );
}

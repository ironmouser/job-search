import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from '@/lib/prisma';
import PipelineBoard from './PipelineBoard';
import { PageHeader, PageHeaderHeading, PageHeaderDescription } from '@/components/ui/page-header';

export const revalidate = 0;

export default async function PipelinePage() {
  const session = await getServerSession(authOptions);
  
  if (!session?.user?.id) {
    return (
      <div style={{ textAlign: 'center', padding: '4rem 2rem' }}>
        <PageHeader>
          <PageHeaderHeading>Active Pipeline</PageHeaderHeading>
          <PageHeaderDescription>Please log in to view your pipeline.</PageHeaderDescription>
        </PageHeader>
      </div>
    );
  }

  const userId = session.user.id;
  let userJobs: any[] = [];
  
  try {
    userJobs = await prisma.userJob.findMany({
      where: { 
        userId,
        status: { not: 'deleted' },
        OR: [
          { status: { in: ['applied', 'interviewing', 'offer', 'rejected', 'Applied', 'Interviewing', 'Offer', 'Rejected'] } },
          { appliedAt: { not: null } }
        ]
      },
      include: {
        job: { select: { id: true, title: true, company: true, location: true, salaryRange: true } }
      },
      orderBy: [
        { appliedAt: 'desc' },
        { createdAt: 'desc' }
      ]
    });
  } catch (error: any) {
    console.error('Failed to fetch pipeline jobs:', error);
  }

  const mappedJobs = userJobs.map(uj => {
    let rawStatus = (uj.status || '').toLowerCase();
    let status = 'applied';
    
    if (['interviewing', 'offer', 'rejected'].includes(rawStatus)) {
      status = rawStatus;
    } else {
      status = 'applied';
    }

    return {
      id: uj.job.id,
      title: uj.job.title,
      company: uj.job.company,
      status,
      location: uj.job.location,
      salary_range: uj.job.salaryRange,
      applied_at: uj.appliedAt ? uj.appliedAt.toISOString() : null,
      created_at: uj.createdAt ? uj.createdAt.toISOString() : null,
    };
  });

  return (
    <div className="animate-fade-in" style={{ paddingBottom: '4rem', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <PageHeader>
        <div>
          <PageHeaderHeading>Active Pipeline</PageHeaderHeading>
          <PageHeaderDescription>Track your active applications, interview rounds, and offers in real-time</PageHeaderDescription>
        </div>
      </PageHeader>

      <PipelineBoard initialJobs={mappedJobs} />
    </div>
  );
}

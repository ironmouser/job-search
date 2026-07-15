const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const email = process.argv[2];
    if (!email) {
        console.error("Please provide the user's email as an argument.");
        process.exit(1);
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
        console.error(`User with email ${email} not found. Please log in first.`);
        process.exit(1);
    }

    const userId = user.id;
    console.log(`Assigning existing data to user ${userId} (${email})...`);

    // 1. Assign Jobs to UserJob
    const jobs = await prisma.job.findMany();
    let userJobsCreated = 0;
    for (const job of jobs) {
        const existingUserJob = await prisma.userJob.findUnique({
            where: { userId_jobId: { userId, jobId: job.id } }
        });

        if (!existingUserJob) {
            await prisma.userJob.create({
                data: {
                    userId,
                    jobId: job.id,
                    status: job.status,
                    appliedAt: job.appliedAt,
                    isArchived: job.isArchived,
                    createdAt: job.createdAt
                }
            });
            userJobsCreated++;
        }
    }
    console.log(`Created ${userJobsCreated} UserJob records.`);

    // 2. Assign OpportunityScores
    const scores = await prisma.opportunityScore.updateMany({
        where: { userId: null },
        data: { userId }
    });
    console.log(`Assigned ${scores.count} OpportunityScores.`);

    // 3. Assign ApplicationAssets
    const assets = await prisma.applicationAsset.updateMany({
        where: { userId: null },
        data: { userId }
    });
    console.log(`Assigned ${assets.count} ApplicationAssets.`);

    // 4. Assign JobFeedbacks
    const feedbacks = await prisma.jobFeedback.updateMany({
        where: { userId: null },
        data: { userId }
    });
    console.log(`Assigned ${feedbacks.count} JobFeedbacks.`);

    // 5. Setup UserPreferences from settings.json if it exists
    const fs = require('fs');
    const path = require('path');
    const settingsPath = path.resolve(process.cwd(), 'settings.json');
    const resumePath = path.resolve(process.cwd(), 'base_resume.md');
    
    let resumeMarkdown = null;
    if (fs.existsSync(resumePath)) {
        resumeMarkdown = fs.readFileSync(resumePath, 'utf8');
    }

    let searchKeyword = null;
    let searchLocation = null;
    let customCareerPages = [];
    let sources = {};

    if (fs.existsSync(settingsPath)) {
        const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        searchKeyword = settings.searchKeyword;
        searchLocation = settings.searchLocation;
        customCareerPages = settings.customCareerPages || [];
        sources = settings.sources || {};
    }

    const existingPrefs = await prisma.userPreferences.findUnique({ where: { userId } });
    if (!existingPrefs) {
        await prisma.userPreferences.create({
            data: {
                userId,
                searchKeyword,
                searchLocation,
                customCareerPages,
                sources,
                resumeMarkdown
            }
        });
        console.log(`Created UserPreferences from local files.`);
    }

    console.log("Migration complete!");
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });

export {};

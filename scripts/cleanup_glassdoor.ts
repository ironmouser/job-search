import 'dotenv/config';
import { prisma } from '../src/lib/prisma';

async function main() {
    console.log('Inspecting Glassdoor jobs in database...');
    
    const allGlassdoorJobs = await prisma.job.findMany({
        where: {
            OR: [
                { source: { contains: 'glassdoor', mode: 'insensitive' } },
                { url: { contains: 'glassdoor.com', mode: 'insensitive' } }
            ]
        },
        select: {
            id: true,
            title: true,
            company: true,
            source: true,
            url: true
        }
    });

    console.log(`TOTAL_FOUND: ${allGlassdoorJobs.length}`);

    const emailSyncJobs = allGlassdoorJobs.filter(j => j.source && j.source.toLowerCase().includes('email'));
    const scraperJobs = allGlassdoorJobs.filter(j => !j.source || !j.source.toLowerCase().includes('email'));

    console.log(`EMAIL_SYNC_KEPT: ${emailSyncJobs.length}`);
    console.log(`NON_EMAIL_TO_DELETE: ${scraperJobs.length}`);

    if (scraperJobs.length > 0) {
        const idsToDelete = scraperJobs.map(j => j.id);

        const result = await prisma.job.deleteMany({
            where: { id: { in: idsToDelete } }
        });

        console.log(`DELETED_COUNT: ${result.count}`);
    } else {
        console.log('DELETED_COUNT: 0');
    }
}

main()
    .catch(err => {
        console.error('Cleanup error:', err.message || err);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });

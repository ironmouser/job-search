import { PrismaClient } from '@prisma/client';
import { reformatJobDescriptionWithGemini } from './src/lib/formatter';
import dotenv from 'dotenv';
import dns from 'dns';

try {
    dns.setDefaultResultOrder('ipv4first');
} catch {}

dotenv.config({ path: '.env.local' });

const prisma = new PrismaClient();

async function main() {
    console.log('Starting job description backfill formatting...');
    
    const jobs = await prisma.job.findMany({
        where: {
            OR: [
                { source: 'kforce' },
                { description: { not: '' } }
            ]
        }
    });

    console.log(`Found ${jobs.length} total jobs to inspect.`);

    let updatedCount = 0;
    for (const job of jobs) {
        const rawDesc = job.description || '';
        if (rawDesc.length > 50 && (!rawDesc.includes('## ') || rawDesc.includes('  ') || job.source === 'kforce')) {
            console.log(`Reformatting job ID ${job.id} - ${job.title} (${job.source})...`);
            
            let contentToFormat = rawDesc;
            let applySuffix = '';
            const applyMatch = rawDesc.match(/(\n\nApply at: https?:\/\/\S+)$/);
            if (applyMatch) {
                contentToFormat = rawDesc.slice(0, applyMatch.index);
                applySuffix = applyMatch[0];
            }

            try {
                const formatted = await reformatJobDescriptionWithGemini(contentToFormat);
                const finalDescription = formatted + (applySuffix || (job.url ? `\n\nApply at: ${job.url}` : ''));
                
                await prisma.job.update({
                    where: { id: job.id },
                    data: { description: finalDescription }
                });
                updatedCount++;
                console.log(`Updated job ID ${job.id} successfully.`);
            } catch (err: any) {
                console.error(`Failed to reformat job ID ${job.id}:`, err?.message || err);
            }
        }
    }

    console.log(`Backfill complete. Updated ${updatedCount} job descriptions.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());

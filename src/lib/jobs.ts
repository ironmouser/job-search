import { prisma } from './prisma';
import { getUserSettings } from './settings';
import { reformatJobDescriptionWithGemini } from './formatter';
import { cleanJobUrl } from './urlUtils';
import { callAI } from './ai';
import { isInternationalLocation, isRemoteLocation } from './locationUtils';
import { cleanCompanyName } from './cleaners';

const cleanNullBytes = (str: string | null | undefined): string => {
    if (!str) return '';
    return str.replace(/\u0000/g, '');
};

export async function bulkIngestRawJobsToGlobalDb(rawJobs: any[]) {
    if (!rawJobs || rawJobs.length === 0) return;
    try {
        const createData: any[] = [];
        const seenUrls = new Set<string>();

        for (const j of rawJobs) {
            const rawUrl = j.url || j.link;
            if (!rawUrl || !j.title) continue;
            const cleanedUrl = cleanJobUrl(rawUrl);
            if (!cleanedUrl || seenUrls.has(cleanedUrl)) continue;
            seenUrls.add(cleanedUrl);

            const safeTitle = cleanNullBytes(j.title?.trim()) || 'Untitled Position';
            const safeCompany = cleanNullBytes(cleanCompanyName(j.company)) || 'Unknown Company';
            const safeLocation = cleanNullBytes(j.location) || 'Remote';
            const safeSalaryRange = cleanNullBytes(j.salary_range || j.salary);
            const safeDescription = cleanNullBytes(j.description) || `Found via job search: ${cleanedUrl}`;
            const safeSource = cleanNullBytes(j.source) || 'Direct';

            createData.push({
                title: safeTitle,
                company: safeCompany,
                location: safeLocation,
                salaryRange: safeSalaryRange || null,
                description: safeDescription,
                url: cleanedUrl,
                source: safeSource
            });
        }

        if (createData.length > 0) {
            await prisma.job.createMany({
                data: createData,
                skipDuplicates: true
            });
            console.log(`[Global Pool Ingestion] Bulk ingested ${createData.length} scraped jobs into global DB pool.`);
        }
    } catch (err: any) {
        console.warn(`[Global Pool Ingestion Issue] Background bulk ingestion warning: ${err.message}`);
    }
}

export async function normalizeAndSaveJobs(
    rawJobs: any[],
    userId: string,
    options: { 
        isEmailSync?: boolean; 
        skipAiTriage?: boolean; 
        onProgress?: (count: number, message: string) => void;
        searchKeyword?: string;
        searchLocation?: string;
        remoteOnly?: boolean;
        noInternational?: boolean;
        includeKeywords?: string;
        excludeKeywords?: string;
    } = {}
) {
    if (!rawJobs || rawJobs.length === 0) return [];
    const { onProgress, isEmailSync, skipAiTriage } = options;
    const settings: any = await getUserSettings(userId);
    const remoteOnly = options.remoteOnly !== undefined ? options.remoteOnly : (settings.remoteOnly || false);
    const noInternational = options.noInternational !== undefined ? options.noInternational : (settings.noInternational || false);
    const includeKeywordsStr: string = (options.includeKeywords !== undefined ? options.includeKeywords : (settings.includeKeywords || '')).trim();
    const excludeKeywordsStr: string = (options.excludeKeywords !== undefined ? options.excludeKeywords : (settings.excludeKeywords || '')).trim();
    const searchKeyword: string = (options.searchKeyword !== undefined ? options.searchKeyword : (settings.searchKeyword || '')).trim();
    const profileText: string = (settings.profile || settings.resumeMarkdown || '').slice(0, 800);

    const rawCount = rawJobs.length;

    // Stage 1: URL Canonicalization & Early In-Batch Deduplication
    const deduplicatedJobs: any[] = [];
    const seenUrls = new Set<string>();
    const seenTitleCompany = new Set<string>();

    for (const job of rawJobs) {
        const rawUrl = job.url || job.link;
        const title = job.title?.trim();
        if (!rawUrl || !title) continue;

        const cleanedUrl = cleanJobUrl(rawUrl);
        if (seenUrls.has(cleanedUrl)) continue;

        const company = cleanCompanyName(job.company) || 'Unknown Company';
        const titleCompanyKey = `${title.toLowerCase().trim()}|${company.toLowerCase().trim()}`;
        if (seenTitleCompany.has(titleCompanyKey)) {
            console.log(`[Early Dedup] Skipping duplicate title+company: "${title}" at "${company}"`);
            continue;
        }

        seenUrls.add(cleanedUrl);
        seenTitleCompany.add(titleCompanyKey);

        const fallbackDesc = `Found via email link: ${cleanedUrl}`;
        const description = (job.description && job.description.trim().length > 0) ? job.description.trim() : fallbackDesc;

        deduplicatedJobs.push({
            title,
            company,
            location: job.location || 'Remote',
            salaryRange: job.salary_range || job.salary || null,
            description,
            requirements: null,
            url: cleanedUrl,
            applicationUrl: job.applicationUrl || null,
            source: job.source || 'Direct',
            isEasyApply: !!job.isEasyApply,
        });
    }

    const droppedInvalidOrDupes = rawCount - deduplicatedJobs.length;
    if (droppedInvalidOrDupes > 0) {
        onProgress?.(deduplicatedJobs.length, `Removed ${droppedInvalidOrDupes} duplicate or invalid listing${droppedInvalidOrDupes === 1 ? '' : 's'}`);
    }

    // Stage 2: Fire non-blocking background task to bulk populate all valid scraped jobs into global DB pool
    bulkIngestRawJobsToGlobalDb(deduplicatedJobs).catch(err => {
        console.warn(`[Global Pool Ingestion Background Error]: ${err.message}`);
    });

    // Stage 3: User Personal Deterministic Location & Keyword Filters
    let normalizedJobs = [...deduplicatedJobs];

    if (remoteOnly) {
        const before = normalizedJobs.length;
        normalizedJobs = normalizedJobs.filter(j => isRemoteLocation(j.location || ''));
        const dropped = before - normalizedJobs.length;
        if (dropped > 0) onProgress?.(normalizedJobs.length, `Removed ${dropped} non-remote listing${dropped === 1 ? '' : 's'} based on your location preferences`);
    }

    if (noInternational) {
        const before = normalizedJobs.length;
        normalizedJobs = normalizedJobs.filter(j => !isInternationalLocation(j.location || ''));
        const dropped = before - normalizedJobs.length;
        if (dropped > 0) onProgress?.(normalizedJobs.length, `Removed ${dropped} international listing${dropped === 1 ? '' : 's'} based on your location preferences`);
    }

    const excludeTerms = excludeKeywordsStr.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    const includeTerms = includeKeywordsStr.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

    if (excludeTerms.length > 0) {
        const before = normalizedJobs.length;
        normalizedJobs = normalizedJobs.filter(j => {
            const contentLower = `${j.title} ${j.company} ${j.description || ''}`.toLowerCase();
            const hit = excludeTerms.find(term => contentLower.includes(term));
            if (hit) {
                console.log(`[Pre-Filter] Discarding "${j.title}" at "${j.company}" due to excluded keyword: "${hit}"`);
                return false;
            }
            return true;
        });
        const dropped = before - normalizedJobs.length;
        if (dropped > 0) onProgress?.(normalizedJobs.length, `Removed ${dropped} listing${dropped === 1 ? '' : 's'} matching your excluded keywords`);
    }

    if (includeTerms.length > 0) {
        const before = normalizedJobs.length;
        normalizedJobs = normalizedJobs.filter(j => {
            const desc = j.description || '';
            const isStubOnly = /^found via email link:\s*https?:/i.test(desc.trim());
            const contentLower = `${j.title} ${desc}`.toLowerCase();
            const match = includeTerms.some(term => contentLower.includes(term));

            if (match) return true;
            if (isEmailSync && isStubOnly) return true;

            console.log(`[Pre-Filter] Discarding "${j.title}" at "${j.company}" due to missing required keywords.`);
            return false;
        });
        const dropped = before - normalizedJobs.length;
        if (dropped > 0) onProgress?.(normalizedJobs.length, `Removed ${dropped} listing${dropped === 1 ? '' : 's'} missing your required keywords`);
    }

    // Check existing jobs in DB to separate truly new candidates from already discovered jobs
    const urlsToProcess = normalizedJobs.map(j => j.url);
    const existingJobs = await prisma.job.findMany({
        where: { url: { in: urlsToProcess } },
        select: { id: true, url: true }
    });
    
    let userExistingJobIds = new Set<string>();
    let userExistingTitleCompany = new Set<string>();
    if (existingJobs.length > 0) {
        const ujs = await prisma.userJob.findMany({
            where: {
                userId,
                jobId: { in: existingJobs.map(j => j.id) }
            },
            select: { jobId: true }
        });
        userExistingJobIds = new Set(ujs.map(u => u.jobId));
    }

    // Also fetch ALL user's existing jobs (title+company) to skip near-duplicates with different URLs
    const allUserJobsForDedup = await prisma.userJob.findMany({
        where: { userId, status: { not: 'deleted' } },
        include: { job: { select: { title: true, company: true } } }
    });
    userExistingTitleCompany = new Set(
        allUserJobsForDedup.map(uj =>
            `${uj.job.title.toLowerCase().trim()}|${uj.job.company.toLowerCase().trim()}`
        )
    );

    const knownGoodJobs: any[] = [];
    const brandNewCandidates: any[] = [];
    let dbDedupDropped = 0;

    for (const jobData of normalizedJobs) {
        const match = existingJobs.find(e => e.url === jobData.url);
        if (match && userExistingJobIds.has(match.id)) {
            knownGoodJobs.push(jobData);
        } else {
            // Skip brand-new jobs that are near-duplicates of existing user jobs (same title+company, different URL)
            const titleCompanyKey = `${jobData.title.toLowerCase().trim()}|${jobData.company.toLowerCase().trim()}`;
            if (!match && userExistingTitleCompany.has(titleCompanyKey)) {
                console.log(`[DB Dedup] Skipping "${jobData.title}" at "${jobData.company}" — user already has this role under a different URL.`);
                dbDedupDropped++;
                continue;
            }
            brandNewCandidates.push(jobData);
        }
    }
    if (dbDedupDropped > 0 || knownGoodJobs.length > 0) {
        const totalAlreadyHave = dbDedupDropped + knownGoodJobs.length;
        onProgress?.(brandNewCandidates.length, `Skipped ${totalAlreadyHave} role${totalAlreadyHave === 1 ? '' : 's'} already in your list`);
    }

    // Tier 2: Batched Rapid Triage via DeepSeek (Lite Pass)
    const approvedCandidates: any[] = [];

    if (brandNewCandidates.length > 0 && searchKeyword && !skipAiTriage) {
        console.log(`[AI Triage] Running DeepSeek rapid pre-screening on ${brandNewCandidates.length} new candidate jobs for keyword "${searchKeyword}"...`);
        onProgress?.(brandNewCandidates.length, `Running AI quality check on ${brandNewCandidates.length} new listing${brandNewCandidates.length === 1 ? '' : 's'}...`);
        
        const chunkSize = 20;
        for (let i = 0; i < brandNewCandidates.length; i += chunkSize) {
            const chunk = brandNewCandidates.slice(i, i + chunkSize);
            const candidatesPayload = chunk.map((c, index) => {
                const rawSnippet = (c.description || '').slice(0, 200);
                // For email stubs ("Found via email link: ..."), send an empty snippet
                // rather than a URL string — the AI should judge by title+company only.
                const isStub = /^found via email link:/i.test(rawSnippet) || rawSnippet.trim() === '';
                return {
                    index,
                    title: c.title,
                    company: c.company,
                    snippet: isStub ? '' : rawSnippet
                };
            });

            try {
                const triageResponse = await callAI({
                    task: 'triage',
                    jsonMode: true,
                    maxTokens: 1000,
                    userId,
                    messages: [
                        {
                            role: 'system',
                            content: 'You are an AI recruitment triage filter. Review candidate job listings against the candidate search criteria and background. Discard obvious spam, completely unrelated fields, and severe seniority mismatches. Allow adjacent and relevant career track titles (e.g., Account Executive or Client Success for Account Manager; Software Engineer or Full Stack for Developer). Return ONLY valid JSON matching: {"results": [{"index": 0, "pass": true, "reason": "Relevant role"}]}'
                        },
                        {
                            role: 'user',
                            content: JSON.stringify({
                                candidateSearchKeyword: searchKeyword,
                                candidateBackgroundSnippet: profileText,
                                candidateJobs: candidatesPayload
                            })
                        }
                    ]
                });

                const parsed = JSON.parse(triageResponse);
                const results: any[] = parsed?.results || [];

                for (let idx = 0; idx < chunk.length; idx++) {
                    const res = results.find((r: any) => r.index === idx);
                    if (res && res.pass === false) {
                        console.log(`[AI Triage Rejected] Discarding "${chunk[idx].title}" at "${chunk[idx].company}": ${res.reason || 'Not a fit'}`);
                    } else {
                        approvedCandidates.push(chunk[idx]);
                    }
                }
            } catch (err: any) {
                console.warn(`[AI Triage Error] Failing open for chunk due to error: ${err.message}`);
                approvedCandidates.push(...chunk);
            }
        }
        const droppedByAI = brandNewCandidates.length - approvedCandidates.length;
        if (droppedByAI > 0) {
            onProgress?.(approvedCandidates.length, `AI filtered out ${droppedByAI} poor match${droppedByAI === 1 ? '' : 'es'} based on your profile`);
        }
    } else {
        approvedCandidates.push(...brandNewCandidates);
    }

    // Tier 3: Persistence
    // Save existing roles and cap NEW UserJob feed allocations to top 100 brand-new candidate matches per sync
    const newAllocatedCandidates = approvedCandidates.slice(0, 100);
    const finalJobsToSave = [...knownGoodJobs, ...newAllocatedCandidates];
    const userAllocationUrls = new Set(finalJobsToSave.map(j => j.url));
    let newSavedCount = 0;

    const newCandidatesCount = newAllocatedCandidates.length;
    if (newCandidatesCount === 0) {
        onProgress?.(0, 'No new job listings to add (all discovered roles were already in your list or filtered out)');
    } else {
        onProgress?.(newCandidatesCount, `Finalizing ${newCandidatesCount} new qualified job${newCandidatesCount === 1 ? '' : 's'} for your list...`);
    }
    const processedUrls: string[] = [];

    for (const jobData of finalJobsToSave) {
      try {
        const cleanedUrl = cleanJobUrl(jobData.url);
        if (!cleanedUrl || processedUrls.includes(cleanedUrl)) continue;
        processedUrls.push(cleanedUrl);

        const safeTitle = cleanNullBytes(jobData.title) || 'Untitled Position';
        const safeCompany = cleanNullBytes(jobData.company) || 'Unknown Company';
        const safeLocation = cleanNullBytes(jobData.location) || 'Remote';
        const safeSalaryRange = cleanNullBytes(jobData.salaryRange);
        const safeDescription = cleanNullBytes(jobData.description) || `Found via job search: ${cleanedUrl}`;
        const safeSource = cleanNullBytes(jobData.source) || 'Direct';

        let job = await prisma.job.findUnique({ where: { url: cleanedUrl } });
        if (!job) {
            try {
                job = await prisma.job.create({
                    data: {
                        title: safeTitle,
                        company: safeCompany,
                        location: safeLocation,
                        salaryRange: safeSalaryRange || null,
                        description: safeDescription,
                        url: cleanedUrl,
                        applicationUrl: jobData.applicationUrl || null,
                        source: safeSource,
                        isEasyApply: !!jobData.isEasyApply,
                    }
                });
            } catch (e: any) {
                if (e.code === 'P2002') {
                    job = await prisma.job.findUnique({ where: { url: cleanedUrl } });
                }
                if (!job) {
                    console.error(`[Job Save Error] Could not create job "${safeTitle}" at "${safeCompany}":`, e);
                    continue;
                }
            }
        } else {
            const updates: any = {};
            if (!job.description || job.description.trim().length === 0) {
                updates.description = safeDescription;
            }
            if (!job.applicationUrl && jobData.applicationUrl) {
                updates.applicationUrl = jobData.applicationUrl;
            }
            if (!job.isEasyApply && jobData.isEasyApply) {
                updates.isEasyApply = true;
            }
            if (Object.keys(updates).length > 0) {
                try {
                    await prisma.job.update({
                        where: { id: job.id },
                        data: updates
                    });
                } catch (e) {
                    console.warn(`[Job Update Error] Failed to update job ${job.id}:`, e);
                }
            }
        }

        // Link to UserJob for top 100 allocated matches for this sync run
        if (userAllocationUrls.has(cleanedUrl) || userAllocationUrls.has(jobData.url)) {
          const existingUj = await prisma.userJob.findUnique({
              where: { userId_jobId: { userId, jobId: job.id } },
              select: { id: true, status: true }
          });
          if (!existingUj) {
              newSavedCount++;
          }
          await prisma.userJob.upsert({
              where: { userId_jobId: { userId, jobId: job.id } },
              update: {
                  ...(existingUj?.status === 'deleted' ? {} : { status: 'discovered' })
              },
              create: {
                  userId,
                  jobId: job.id,
                  status: 'discovered'
              }
          });
        }
      } catch (itemErr: any) {
        console.error(`[Job Persistence Error] Error processing listing:`, itemErr);
      }
    }
    
    const data = await prisma.job.findMany({
        where: { url: { in: processedUrls } }
    });
    
    console.log(`Successfully processed ${data?.length || 0} jobs (${newSavedCount} new) for user ${userId}.`);
    const resultArr: any = data || [];
    resultArr.newSavedCount = newSavedCount;
    return resultArr;
}


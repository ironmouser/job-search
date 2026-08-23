import { prisma } from './prisma';
import { getUserSettings } from './settings';
import { reformatJobDescriptionWithGemini } from './formatter';
import { cleanJobUrl, isNonJobUrl } from './urlUtils';
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
            if (!cleanedUrl || isNonJobUrl(cleanedUrl) || seenUrls.has(cleanedUrl)) continue;
            seenUrls.add(cleanedUrl);

            const safeTitle = cleanNullBytes(j.title?.trim()) || 'Untitled Position';
            const safeCompany = cleanNullBytes(cleanCompanyName(j.company)) || 'Unknown Company';
            if (safeTitle.toLowerCase() === 'unknown' || safeTitle.toLowerCase() === 'unknown company') continue;
            if (safeTitle.toLowerCase() === safeCompany.toLowerCase() && (safeCompany.toLowerCase() === 'unknown company' || safeCompany.toLowerCase() === 'unknown')) continue;

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
        if (!cleanedUrl || isNonJobUrl(cleanedUrl) || seenUrls.has(cleanedUrl)) continue;

        const lowerTitle = title.toLowerCase();
        if (lowerTitle === 'unknown' || lowerTitle === 'unknown company' || lowerTitle === 'unknown title' || lowerTitle === 'overview') {
            continue;
        }

        const company = cleanCompanyName(job.company) || 'Unknown Company';
        if (lowerTitle === company.toLowerCase() && (company.toLowerCase() === 'unknown company' || company.toLowerCase() === 'unknown')) {
            continue;
        }

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

    const escapeRegex = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const excludeTerms = excludeKeywordsStr.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    const includeTerms = includeKeywordsStr.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

    if (excludeTerms.length > 0) {
        const before = normalizedJobs.length;
        normalizedJobs = normalizedJobs.filter(j => {
            const contentLower = `${j.title} ${j.company} ${j.description || ''}`.toLowerCase();
            const hit = excludeTerms.find(term => {
                try {
                    const regex = new RegExp(`\\b${escapeRegex(term)}\\b`, 'i');
                    return regex.test(contentLower);
                } catch {
                    return contentLower.includes(term);
                }
            });
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
            const isStubOrShortEmail = isEmailSync && (desc.length < 500 || /^found via email link:\s*https?:/i.test(desc.trim()));
            if (isStubOrShortEmail) return true;

            const contentLower = `${j.title} ${desc}`.toLowerCase();
            const match = includeTerms.some(term => {
                try {
                    const regex = new RegExp(`\\b${escapeRegex(term)}\\b`, 'i');
                    return regex.test(contentLower);
                } catch {
                    return contentLower.includes(term);
                }
            });

            if (match) return true;

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

    // Tier 2: Batched Rapid Triage via DeepSeek (Lite Pass) - Parallelized
    const approvedCandidates: any[] = [];

    if (brandNewCandidates.length > 0 && searchKeyword && !skipAiTriage) {
        console.log(`[AI Triage] Running rapid pre-screening on ${brandNewCandidates.length} new candidate jobs in parallel for keyword "${searchKeyword}"...`);
        onProgress?.(brandNewCandidates.length, `Running AI quality check on ${brandNewCandidates.length} new listing${brandNewCandidates.length === 1 ? '' : 's'}...`);
        
        const chunkSize = 25;
        const chunks: any[][] = [];
        for (let i = 0; i < brandNewCandidates.length; i += chunkSize) {
            chunks.push(brandNewCandidates.slice(i, i + chunkSize));
        }

        const triageResults = await Promise.all(
            chunks.map(async (chunk) => {
                const candidatesPayload = chunk.map((c, index) => {
                    const rawSnippet = (c.description || '').slice(0, 200);
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
                                content: 'You are an AI recruitment triage filter. Review candidate job listings against the candidate search criteria and background. Note: If the candidate search criteria lists multiple roles or career tracks (e.g. comma-separated), approve listings that match or are relevant to ANY of the specified tracks. Discard obvious spam, completely unrelated fields, and severe seniority mismatches. Allow adjacent and relevant career track titles (e.g., Account Executive or Client Success for Account Manager; Software Engineer or Full Stack for Developer). Return ONLY valid JSON matching: {"results": [{"index": 0, "pass": true, "reason": "Relevant role"}]}'
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
                    const approved: any[] = [];

                    for (let idx = 0; idx < chunk.length; idx++) {
                        const res = results.find((r: any) => r.index === idx);
                        if (res && res.pass === false) {
                            console.log(`[AI Triage Rejected] Discarding "${chunk[idx].title}" at "${chunk[idx].company}": ${res.reason || 'Not a fit'}`);
                        } else {
                            approved.push(chunk[idx]);
                        }
                    }
                    return approved;
                } catch (err: any) {
                    console.warn(`[AI Triage Error] Failing open for chunk due to error: ${err.message}`);
                    return chunk;
                }
            })
        );

        for (const approvedChunk of triageResults) {
            approvedCandidates.push(...approvedChunk);
        }

        const droppedByAI = brandNewCandidates.length - approvedCandidates.length;
        if (droppedByAI > 0) {
            onProgress?.(approvedCandidates.length, `AI filtered out ${droppedByAI} poor match${droppedByAI === 1 ? '' : 'es'} based on your profile`);
        }
    } else {
        approvedCandidates.push(...brandNewCandidates);
    }

    // Tier 3: Persistence (Bulk Optimized)
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

    // Prepare distinct jobs for bulk insertion
    const uniqueJobsMap = new Map<string, any>();
    for (const jobData of finalJobsToSave) {
        const cleanedUrl = cleanJobUrl(jobData.url);
        if (!cleanedUrl || uniqueJobsMap.has(cleanedUrl)) continue;

        uniqueJobsMap.set(cleanedUrl, {
            title: cleanNullBytes(jobData.title) || 'Untitled Position',
            company: cleanNullBytes(jobData.company) || 'Unknown Company',
            location: cleanNullBytes(jobData.location) || 'Remote',
            salaryRange: cleanNullBytes(jobData.salaryRange) || null,
            description: cleanNullBytes(jobData.description) || `Found via job search: ${cleanedUrl}`,
            url: cleanedUrl,
            applicationUrl: jobData.applicationUrl || null,
            source: cleanNullBytes(jobData.source) || 'Direct',
            isEasyApply: !!jobData.isEasyApply
        });
    }

    const preparedJobs = Array.from(uniqueJobsMap.values());
    const processedUrls = preparedJobs.map(j => j.url);

    if (preparedJobs.length > 0) {
        // Bulk insert all new jobs in a single query
        try {
            await prisma.job.createMany({
                data: preparedJobs.map(j => ({
                    title: j.title,
                    company: j.company,
                    location: j.location,
                    salaryRange: j.salaryRange,
                    description: j.description,
                    url: j.url,
                    applicationUrl: j.applicationUrl,
                    source: j.source,
                    isEasyApply: j.isEasyApply
                })),
                skipDuplicates: true
            });
        } catch (bulkErr: any) {
            console.warn(`[Bulk Job Create Notice]: ${bulkErr.message}`);
        }
    }

    // Bulk fetch all relevant Job records by URL
    const dbJobs = await prisma.job.findMany({
        where: { url: { in: processedUrls } },
        select: { id: true, url: true, title: true, description: true, applicationUrl: true, isEasyApply: true }
    });
    const dbJobByUrl = new Map(dbJobs.map(j => [j.url, j]));

    // Batch enrich any existing jobs that lacked description or applicationUrl
    const updatePromises: Promise<any>[] = [];
    for (const prep of preparedJobs) {
        const existing = dbJobByUrl.get(prep.url);
        if (!existing) continue;

        const updates: any = {};
        if ((!existing.description || existing.description.trim().length === 0) && prep.description) {
            updates.description = prep.description;
        }
        if (!existing.applicationUrl && prep.applicationUrl) {
            updates.applicationUrl = prep.applicationUrl;
        }
        if (!existing.isEasyApply && prep.isEasyApply) {
            updates.isEasyApply = true;
        }
        if (Object.keys(updates).length > 0) {
            updatePromises.push(
                prisma.job.update({ where: { id: existing.id }, data: updates }).catch(e => {
                    console.warn(`[Job Update Notice]:`, e.message);
                })
            );
        }
    }
    if (updatePromises.length > 0) {
        await Promise.all(updatePromises);
    }

    // Bulk link candidate jobs to UserJob
    const candidateDbJobsToLink = dbJobs.filter(j => userAllocationUrls.has(j.url));
    const candidateJobIds = candidateDbJobsToLink.map(j => j.id);

    if (candidateJobIds.length > 0) {
        const [existingUserJobs, existingScores] = await Promise.all([
            prisma.userJob.findMany({
                where: {
                    userId,
                    jobId: { in: candidateJobIds }
                },
                select: { jobId: true, status: true }
            }),
            prisma.opportunityScore.findMany({
                where: {
                    userId,
                    jobId: { in: candidateJobIds }
                },
                select: { jobId: true, totalScore: true }
            })
        ]);
        const existingUserJobMap = new Map(existingUserJobs.map(uj => [uj.jobId, uj.status]));
        const lowScoreJobIds = new Set(
            existingScores.filter(s => s.totalScore !== null && s.totalScore < 50).map(s => s.jobId)
        );

        const newUserJobsToCreate: { userId: string; jobId: string; status: string }[] = [];

        for (const job of candidateDbJobsToLink) {
            if (lowScoreJobIds.has(job.id)) {
                console.log(`[Job Ingestion] Skipping job ${job.id} ("${job.title}") due to existing low match score (<50).`);
                continue;
            }
            const currentStatus = existingUserJobMap.get(job.id);
            if (currentStatus === undefined) {
                newUserJobsToCreate.push({
                    userId,
                    jobId: job.id,
                    status: 'discovered'
                });
                newSavedCount++;
            }
        }

        if (newUserJobsToCreate.length > 0) {
            try {
                await prisma.userJob.createMany({
                    data: newUserJobsToCreate,
                    skipDuplicates: true
                });
            } catch (ujErr: any) {
                console.warn(`[Bulk UserJob Create Notice]: ${ujErr.message}`);
            }
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


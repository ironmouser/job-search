import { prisma } from './prisma';
import { getUserSettings } from './settings';
import { reformatJobDescriptionWithGemini } from './formatter';
import { cleanJobUrl } from './urlUtils';
import { callDeepSeek } from './deepseek';
import { isInternationalLocation, isRemoteLocation } from './locationUtils';
import { cleanCompanyName } from './cleaners';

export async function normalizeAndSaveJobs(
    rawJobs: any[],
    userId: string,
    options: { isEmailSync?: boolean; skipAiTriage?: boolean; onProgress?: (count: number, message: string) => void } = {}
) {
    if (!rawJobs || rawJobs.length === 0) return [];
    const { onProgress, isEmailSync, skipAiTriage } = options;
    const settings: any = await getUserSettings(userId);
    const remoteOnly = settings.remoteOnly || false;
    const noInternational = settings.noInternational || false;
    const includeKeywordsStr: string = (settings.includeKeywords || '').trim();
    const excludeKeywordsStr: string = (settings.excludeKeywords || '').trim();
    const searchKeyword: string = (settings.searchKeyword || '').trim();
    const profileText: string = (settings.profile || settings.resumeMarkdown || '').slice(0, 800);

    const rawCount = rawJobs.length;
    let normalizedJobs = rawJobs.map((job) => {
        const title = job.title?.trim() || 'Untitled Position';
        const company = cleanCompanyName(job.company) || 'Unknown Company';
        const fallbackDesc = `Found via email link: ${job.url || ''}`;
        const description = (job.description && job.description.trim().length > 0) ? job.description.trim() : fallbackDesc;

        return {
            title,
            company,
            location: job.location || 'Remote',
            salaryRange: job.salary_range || job.salary || null,
            description,
            requirements: null,
            url: job.url,
            source: job.source || 'Direct',
        };
    }).filter(j => j.url && j.title);
    const droppedInvalid = rawCount - normalizedJobs.length;
    if (droppedInvalid > 0) {
        onProgress?.(normalizedJobs.length, `Removed ${droppedInvalid} listing${droppedInvalid === 1 ? '' : 's'} with invalid or missing URLs`);
    }

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

    // Tier 1: Deterministic Keyword Exclusion & Inclusion Filter
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

            // If it's an email job with only a bare URL stub, pass open so we don't discard
            // before the full URL is scraped in the background.
            if (isEmailSync && isStubOnly) {
                return true;
            }

            console.log(`[Pre-Filter] Discarding "${j.title}" at "${j.company}" due to missing required keywords.`);
            return false;
        });
        const dropped = before - normalizedJobs.length;
        if (dropped > 0) onProgress?.(normalizedJobs.length, `Removed ${dropped} listing${dropped === 1 ? '' : 's'} missing your required keywords`);
    }

    // URL cleaning and deduplication
    const deduplicatedJobs: any[] = [];
    const seenUrls = new Set<string>();
    const seenTitleCompany = new Set<string>();

    for (const job of normalizedJobs) {
        const cleanedUrl = cleanJobUrl(job.url);
        if (seenUrls.has(cleanedUrl)) continue;
        // Also deduplicate by exact title+company within this batch
        const titleCompanyKey = `${job.title.toLowerCase().trim()}|${job.company.toLowerCase().trim()}`;
        if (seenTitleCompany.has(titleCompanyKey)) {
            console.log(`[Batch Dedup] Skipping duplicate title+company: "${job.title}" at "${job.company}"`);
            continue;
        }
        seenUrls.add(cleanedUrl);
        seenTitleCompany.add(titleCompanyKey);
        deduplicatedJobs.push({ ...job, url: cleanedUrl });
    }
    const droppedDupes = normalizedJobs.length - deduplicatedJobs.length;
    if (droppedDupes > 0) {
        onProgress?.(deduplicatedJobs.length, `Removed ${droppedDupes} duplicate listing${droppedDupes === 1 ? '' : 's'} found across multiple sources`);
    }

    // Check existing jobs in DB to separate truly new candidates from already discovered jobs
    const urlsToProcess = deduplicatedJobs.map(j => j.url);
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

    for (const jobData of deduplicatedJobs) {
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
                const triageResponse = await callDeepSeek({
                    model: 'deepseek-v4-flash',
                    jsonMode: true,
                    maxTokens: 1000,
                    userId,
                    messages: [
                        {
                            role: 'system',
                            content: 'You are an AI recruitment triage filter. Review candidate job listings against the candidate search criteria and background. Discard promotions, spam, and roles with incompatible career tracks or seniority mismatches. Return ONLY valid JSON matching: {"results": [{"index": 0, "pass": true, "reason": "Relevant role"}]}'
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
    // All discovered listings are saved to global Job DB; cap UserJob feed allocations to top 100 matches per sync
    const finalJobsToSave = [...knownGoodJobs, ...approvedCandidates];
    const userAllocationJobs = finalJobsToSave.slice(0, 100);
    const userAllocationUrls = new Set(userAllocationJobs.map(j => j.url));
    let newSavedCount = 0;

    const newCandidatesCount = approvedCandidates.length;
    if (newCandidatesCount === 0) {
        onProgress?.(0, 'No new job listings to add (all discovered roles were already in your list or filtered out)');
    } else {
        onProgress?.(newCandidatesCount, `Finalizing ${newCandidatesCount} new qualified job${newCandidatesCount === 1 ? '' : 's'} for your list...`);
    }
    const processedUrls: string[] = [];

    for (const jobData of finalJobsToSave) {
      const cleanedUrl = jobData.url;
      if (processedUrls.includes(cleanedUrl)) continue;
      processedUrls.push(cleanedUrl);

      let job = await prisma.job.findUnique({ where: { url: cleanedUrl } });
      if (!job) {
          try {
              job = await prisma.job.create({
                  data: {
                      title: jobData.title,
                      company: jobData.company,
                      location: jobData.location,
                      salaryRange: jobData.salaryRange,
                      description: jobData.description,
                      url: cleanedUrl,
                      source: jobData.source,
                  }
              });
          } catch (e: any) {
              // Handle race condition: another process may have created this exact job just now
              if (e.code === 'P2002') {
                  job = await prisma.job.findUnique({ where: { url: cleanedUrl } });
                  if (!job) throw e;
              } else {
                  throw e;
              }
          }
      } else if (!job.description || job.description.trim().length === 0) {
          await prisma.job.update({
              where: { id: job.id },
              data: { description: jobData.description }
          });
      }
      
      // Link to UserJob only for top 100 allocated matches for this sync run
      if (userAllocationUrls.has(cleanedUrl)) {
        const existingUj = await prisma.userJob.findUnique({
            where: { userId_jobId: { userId, jobId: job.id } },
            select: { id: true }
        });
        if (!existingUj) {
            newSavedCount++;
        }
        await prisma.userJob.upsert({
            where: { userId_jobId: { userId, jobId: job.id } },
            update: {
                status: 'discovered'
            },
            create: {
                userId,
                jobId: job.id,
                status: 'discovered'
            }
        });
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


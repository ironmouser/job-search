import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { gotScraping } from 'got-scraping';
import * as cheerio from 'cheerio';
import { reformatJobDescriptionWithGemini } from '@/lib/formatter';
import { scoreJob } from '@/lib/scoring';
import { detectATSFromUrl } from '@/lib/auto-apply/ats-detector-lite';
import { callAI } from '@/lib/ai';
import { cleanJobUrl, isTrustedJobUrl, isSafePublicUrl, evaluateUrlReputation } from '@/lib/urlUtils';
import { logSuspiciousActivity } from '@/lib/security';
import { getEffectiveTier } from '@/lib/tier';
import { fetchWithScraperAPI, extractATSUrlFromHtml } from '@/lib/scraperapi';

/**
 * Direct scraper helper for Salesforce career pages
 */
async function fetchSalesforceJob(cleanUrl: string) {
  try {
    const match = cleanUrl.match(/JR\d+/i);
    if (!match) return null;
    const reqId = match[0].toUpperCase();

    const [res1, res2] = await Promise.allSettled([
      fetch('https://a.sfdcstatic.com/digital/xsf/careers/prod/jobs_1.json').then(r => r.json()),
      fetch('https://a.sfdcstatic.com/digital/xsf/careers/prod/jobs_2.json').then(r => r.json()),
    ]);

    const list1 = res1.status === 'fulfilled' ? res1.value?.Report_Entry || [] : [];
    const list2 = res2.status === 'fulfilled' ? res2.value?.Report_Entry || [] : [];
    // Prioritize list2 (jobs_2.json) because it contains the full Job_Description
    const allJobs = [...list2, ...list1];

    const matchJob = allJobs.find((j: any) => j.Job_Requisition_Ref_ID === reqId);
    if (!matchJob) return null;

    let salary = null;
    const payTransparency = matchJob['Pay_Transparency_Text_if_location_region_is__Non-Sales-NAT_US___Geo_A_SEL_'];
    if (payTransparency) {
      const salaryMatch = payTransparency.match(/\$[\d,]+\s*-\s*\$[\d,]+/);
      if (salaryMatch) {
        salary = salaryMatch[0];
      }
    }

    return {
      title: matchJob.Job_Posting_Title || '',
      company: 'Salesforce',
      location: matchJob.Job_Requisition_Primary_Location || (matchJob.Locations ? matchJob.Locations.join(', ') : 'Remote'),
      salaryRange: salary,
      description: matchJob.Job_Description || '',
      applicationUrl: matchJob.External_Job_Posting_Site || null,
    };
  } catch (err) {
    console.warn('[add-by-url] Salesforce static fetch failed:', err);
    return null;
  }
}

async function extractAndVerifyJobPostingWithAI(rawText: string) {
  if (!rawText || rawText.trim().length === 0) {
    return null;
  }
  try {
    const prompt = `Extract job details from the following web page content.
Evaluate if this represents an authentic, legitimate job posting for any company (small business, startup, mid-market, or enterprise).
Flag "is_legitimate_job_posting" as false ONLY if the content is completely unrelated to a job (e.g. empty shell, generic homepage, navigation menu only, 404 error, captcha) OR if it is an obvious scam/phishing page (demanding upfront payment, crypto, SSN upfront). If it contains real job description details, "is_legitimate_job_posting" MUST be true.

Return strictly valid JSON with no markdown formatting.
JSON Structure:
{
  "title": "Job Title",
  "company": "Company Name",
  "location": "Location or Remote",
  "salaryRange": "Salary info if present or null",
  "description": "Clean markdown formatted job description",
  "is_legitimate_job_posting": boolean
}

Web Page Content:
${rawText.slice(0, 15000)}`;

    const text = await callAI({
      task: 'extract',
      jsonMode: true,
      messages: [{ role: 'user', content: prompt }]
    });

    const cleanJson = text.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleanJson);
  } catch (err) {
    console.warn('[add-by-url] AI metadata extraction failed:', err);
    return null;
  }
}

function sanitizeManualInput(text?: string | null, maxLength = 25000): string {
  if (!text || typeof text !== 'string') return '';
  let sanitized = text.slice(0, maxLength);
  // Strip dangerous executable/script tags & javascript: protocols
  sanitized = sanitized
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '')
    .replace(/<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi, '')
    .replace(/javascript\s*:/gi, '')
    .replace(/\bon\w+\s*=\s*(['"]).*?\1/gi, '');
  return sanitized.trim();
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;
    const dbUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { planTier: true, trialEndsAt: true, subscriptionType: true, orgAccessExpiresAt: true }
    });
    const isPro = dbUser ? getEffectiveTier(dbUser) === 'PRO' : getEffectiveTier(session.user as any) === 'PRO';

    const body = await request.json();
    const { url: rawUrl, manualTitle, manualCompany, manualDescription, manualLocation } = body;

    const sanitizedManualDescription = sanitizeManualInput(manualDescription, 25000);
    const sanitizedManualTitle = sanitizeManualInput(manualTitle, 200);
    const sanitizedManualCompany = sanitizeManualInput(manualCompany, 200);
    const sanitizedManualLocation = sanitizeManualInput(manualLocation, 200);

    if (!rawUrl && !sanitizedManualDescription) {
      return NextResponse.json({ error: 'Job URL or description is required' }, { status: 400 });
    }

    if (rawUrl && !isSafePublicUrl(rawUrl)) {
      return NextResponse.json({ error: 'Invalid or prohibited URL. Only public http/https URLs are permitted.' }, { status: 400 });
    }

    const cleanUrl = rawUrl ? cleanJobUrl(rawUrl) : `manual-${Date.now()}@userjob`;

    // Perform universal URL & company reputation analysis
    if (rawUrl) {
      const reputation = evaluateUrlReputation(cleanUrl);
      if (!reputation.isLegitimate || reputation.confidence === 'suspicious') {
        await logSuspiciousActivity({ 
          type: 'BLOCKED_SUSPICIOUS_URL', 
          message: `Blocked suspicious URL: ${reputation.reasons.join('; ')}`, 
          userId, 
          metadata: { url: cleanUrl, flags: reputation.flags } 
        });
        return NextResponse.json({ 
          error: 'UNTRUSTED_SOURCE',
          message: `We could not verify that this URL is safe: ${reputation.reasons[0] || 'Suspicious URL pattern.'}`,
          partialData: { 
            title: sanitizedManualTitle || reputation.suggestedCompanyName ? `Position at ${reputation.suggestedCompanyName}` : '',
            company: sanitizedManualCompany || reputation.suggestedCompanyName || '',
            url: cleanUrl
          }
        }, { status: 400 });
      }
    }

    const isTrusted = isTrustedJobUrl(cleanUrl);

    // 1. Check if job already exists in DB by cleanUrl
    let job = rawUrl ? await prisma.job.findUnique({ where: { url: cleanUrl } }) : null;

    // Duplicate Check & Global Limit Check
    if (job) {
      const existingUserJob = await prisma.userJob.findUnique({
        where: { userId_jobId: { userId, jobId: job.id } }
      });
      if (existingUserJob) {
        return NextResponse.json({
          error: 'ALREADY_SAVED',
          message: 'You have already added this job to your pipeline.'
        }, { status: 400 });
      }

      const globalCount = await prisma.userJob.count({ where: { jobId: job.id } });
      if (globalCount >= 10) {
        if (!isPro) {
          await logSuspiciousActivity({ type: 'SPAM_LIMIT_REACHED', message: 'User blocked by spam limit', userId, metadata: { url: cleanUrl, jobId: job.id, count: globalCount } });
          return NextResponse.json({
            error: 'SUBMISSION_LIMIT_REACHED',
            message: 'Popular submission! This job has been added by too many users already. Try finding a more unique job, or upgrade to Pro to bypass this limit.'
          }, { status: 403 });
        }
      }
    }

    let title = sanitizedManualTitle || job?.title || '';
    let company = sanitizedManualCompany || job?.company || '';
    let location = sanitizedManualLocation || job?.location || 'Remote';
    let salaryRange = job?.salaryRange || null;
    let description = sanitizedManualDescription || job?.description || '';

    // If job does not exist and no manual description provided, attempt scraping
    let resolvedApplicationUrl: string | null = null;
    if (!job && !sanitizedManualDescription) {
      let rawHtml = '';
      let fetchSuccess = false;

      // Special handler for Salesforce Career URLs
      if (cleanUrl.includes('salesforce.com') && /JR\d+/i.test(cleanUrl)) {
        const sfJob = await fetchSalesforceJob(cleanUrl);
        if (sfJob && sfJob.description) {
          title = sfJob.title;
          company = sfJob.company;
          location = sfJob.location;
          salaryRange = sfJob.salaryRange;
          description = sfJob.description;
          resolvedApplicationUrl = sfJob.applicationUrl;
          fetchSuccess = true;
        }
      }

      // Tier 1: Direct scrape (fast, free)
      if (!fetchSuccess) {
        try {
          const res = await gotScraping({
            url: cleanUrl,
            timeout: { request: 15000 },
            retry: { limit: 0 },
            throwHttpErrors: false,
          });
          if (res.statusCode >= 200 && res.statusCode < 300) {
            const tempHtml = res.body.toString();
            if (!tempHtml.includes('Just a moment...') && !tempHtml.includes('cf-challenge-error-title')) {
              const $temp = cheerio.load(tempHtml);
              $temp('script, style, noscript, nav, header, footer, iframe, svg').remove();
              const extractedBody = $temp('main, article, .job-description, .job_description, #job-description, [class*="description"], [id*="description"]').text() || $temp('body').text() || '';
              // Verify we got substantive text (not just an empty client-side SPA shell)
              if (extractedBody.trim().length >= 150) {
                rawHtml = tempHtml;
                fetchSuccess = true;
              }
            }
          }
        } catch (e: any) {
          console.warn(`Direct fetch failed for custom URL ${cleanUrl}: ${e.message}`);
        }
      }

      // Tier 2: ScraperAPI (raw HTML fast path first, JS rendering fallback for client-side SPAs)
      if (!fetchSuccess) {
        let scraperHtml = await fetchWithScraperAPI(cleanUrl, false);
        if (scraperHtml) {
          const $temp = cheerio.load(scraperHtml);
          $temp('script, style, noscript, nav, header, footer, iframe, svg').remove();
          const bodyText = $temp('body').text() || '';
          if (bodyText.trim().length < 150) {
            // HTML is a client-side SPA shell; escalate to JS rendering
            scraperHtml = await fetchWithScraperAPI(cleanUrl, true);
          }
        } else {
          scraperHtml = await fetchWithScraperAPI(cleanUrl, true);
        }

        if (scraperHtml) {
          rawHtml = scraperHtml;
          fetchSuccess = true;
          resolvedApplicationUrl = extractATSUrlFromHtml(scraperHtml);
          if (resolvedApplicationUrl) {
            console.info(`[add-by-url] Extracted direct ATS URL: ${resolvedApplicationUrl}`);
          }
        }
      }

      if (fetchSuccess && rawHtml && !description) {
        const $ = cheerio.load(rawHtml);

        // Try extracting from JSON-LD schema
        $('script[type="application/ld+json"]').each((_, el) => {
          try {
            const data = JSON.parse($(el).html() || '');
            const target = data['@type'] === 'JobPosting' ? data : (data['@graph']?.find((g: any) => g['@type'] === 'JobPosting') || data);
            if (target && target['@type'] === 'JobPosting') {
              if (target.title) title = target.title;
              if (target.hiringOrganization?.name) company = target.hiringOrganization.name;
              if (typeof target.description === 'string') description = target.description;
              if (target.jobLocation?.address?.addressLocality) location = target.jobLocation.address.addressLocality;
              if (target.baseSalary?.value?.value) salaryRange = `$${target.baseSalary.value.value}`;
            }
          } catch {}
        });

        // OpenGraph & Meta tag fallbacks for title / company
        if (!title) title = $('meta[property="og:title"]').attr('content') || $('title').text() || '';
        if (!company) company = $('meta[property="og:site_name"]').attr('content') || $('meta[name="author"]').attr('content') || '';

        // Clean up noise & extract body text
        $('script, style, noscript, nav, header, footer, iframe, svg').remove();
        const htmlBody = $('main, article, .job-description, .job_description, #job-description, [class*="description"], [id*="description"]').html() || $('body').html() || '';

        if (htmlBody && (!description || description.length < 50)) {
          description = htmlBody;
        }

        // If metadata is incomplete, description is raw HTML, or it's a custom company URL, run AI extraction & verification
        if (!title || !company || description.includes('<') || !isTrusted) {
          const aiExtracted = await extractAndVerifyJobPostingWithAI(description || $('body').text());
          if (aiExtracted) {
            // Strictly enforce AI authenticity verification
            if (aiExtracted.is_legitimate_job_posting === false) {
              await logSuspiciousActivity({ type: 'AI_PHISHING_FLAG', message: 'AI flagged submitted URL as non-job or malicious content', userId, metadata: { url: cleanUrl } });
              return NextResponse.json({ 
                error: 'UNTRUSTED_SOURCE',
                message: 'We could not verify that this page is an authentic job posting. Please ensure the link points directly to a job opening, or paste the description manually.'
              }, { status: 400 });
            }

            if (!title && aiExtracted.title) title = aiExtracted.title;
            if (!company && aiExtracted.company) company = aiExtracted.company;
            if (aiExtracted.location) location = aiExtracted.location;
            if (aiExtracted.salaryRange) salaryRange = aiExtracted.salaryRange;
            if (aiExtracted.description && aiExtracted.description.length > 50) {
              description = aiExtracted.description;
            }
          } else if (!isTrusted) {
             await logSuspiciousActivity({ type: 'AI_VERIFICATION_FAILED', message: 'AI failed to extract data from custom company URL', userId, metadata: { url: cleanUrl } });
             return NextResponse.json({ 
                error: 'UNTRUSTED_SOURCE',
                message: 'Could not extract job information from this link. Please paste the job description text manually.'
              }, { status: 400 });
          }
        }
      }

      if (description && description.length > 50 && !description.includes('## ')) {
        description = await reformatJobDescriptionWithGemini(description);
      }
    }

    // Validation check: require minimum info
    if (!description || description.trim().length < 30) {
      return NextResponse.json({
        error: 'COULD_NOT_SCRAPE',
        message: 'Could not extract job description from this URL. Please paste the job description text manually.',
        partialData: { title, company, location, url: cleanUrl }
      }, { status: 422 });
    }

    // Default fallback values for title & company
    if (!title) {
      try {
        const u = new URL(cleanUrl);
        title = `Position at ${u.hostname.replace('www.', '')}`;
      } catch {
        title = 'Custom Added Position';
      }
    }
    if (!company) {
      try {
        const u = new URL(cleanUrl);
        company = u.hostname.replace('www.', '').split('.')[0].toUpperCase();
      } catch {
        company = 'Unknown Company';
      }
    }

    // 2. Upsert Job in DB
    if (!job) {
      try {
        job = await prisma.job.create({
          data: {
            title,
            company,
            location,
            salaryRange,
            description,
            url: cleanUrl,
            source: 'User Submission',
            addedById: userId,
            // Save direct ATS URL if extracted from the aggregator page during scraping
            ...(resolvedApplicationUrl ? { applicationUrl: resolvedApplicationUrl } : {}),
          }
        });
      } catch (e: any) {
        if (e.code === 'P2002') {
          job = await prisma.job.findUnique({ where: { url: cleanUrl } });
          if (!job) throw e;
        } else {
          throw e;
        }
      }
    }

    // 3. Upsert UserJob
    const userJob = await prisma.userJob.upsert({
      where: { userId_jobId: { userId, jobId: job.id } },
      update: {
        status: 'discovered',
        isArchived: false,
        isPrivate: isPro,
        unlockedBySubmission: true
      },
      create: {
        userId,
        jobId: job.id,
        status: 'discovered',
        isPrivate: isPro,
        unlockedBySubmission: true
      }
    });

    // 4. Calculate Opportunity Score if not present
    let scoreObj = await prisma.opportunityScore.findUnique({
      where: { userId_jobId: { userId, jobId: job.id } }
    });

    if (!scoreObj) {
      try {
        await scoreJob(userId, job.id, job.title, job.description || '');
        scoreObj = await prisma.opportunityScore.findUnique({
          where: { userId_jobId: { userId, jobId: job.id } }
        });
      } catch (scoreErr) {
        console.warn(`Scoring failed for job ${job.id}:`, scoreErr);
      }
    }

    // 5. Detect ATS confidence
    const atsInfo = detectATSFromUrl(job.url);

    const formattedJob = {
      id: job.id,
      title: job.title,
      company: job.company,
      location: job.location,
      salary_range: job.salaryRange,
      url: job.url,
      description: job.description,
      status: userJob.status,
      is_archived: userJob.isArchived,
      created_at: userJob.createdAt,
      applied_at: userJob.appliedAt,
      opportunity_scores: scoreObj ? [{ total_score: scoreObj.totalScore }] : [],
      job_feedback: [],
      consecutive_auto_failures: 0,
      automation_confidence: atsInfo.confidence,
      unlockedBySubmission: true,
      isPrivate: userJob.isPrivate,
    };

    // Calculate final global count for messaging
    const finalGlobalCount = await prisma.userJob.count({ where: { jobId: job.id } });
    const isPopular = finalGlobalCount >= 10;

    return NextResponse.json({
      success: true,
      job: formattedJob,
      message: isPopular 
        ? 'Popular submission! This job has been added to your pipeline.'
        : isPro
          ? 'Job added privately to your pipeline!'
          : 'Job added! +1 Free Resume & Cover Letter generation unlocked.'
    });

  } catch (error: any) {
    console.error('Error in /api/jobs/add-by-url:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

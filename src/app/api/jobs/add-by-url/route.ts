import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { gotScraping } from 'got-scraping';
import * as cheerio from 'cheerio';
import { reformatJobDescriptionWithGemini } from '@/lib/formatter';
import { scoreJob } from '@/lib/scoring';
import { detectATSFromUrl } from '@/lib/auto-apply/ats-detector-lite';
import { GoogleGenerativeAI } from '@google/generative-ai';

function cleanJobUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl.trim());
    // Strip common tracking query params
    const trackingParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'ref', 'trackingid', 'trackingId', 'gh_src', 'src', 'trk'];
    trackingParams.forEach(param => parsed.searchParams.delete(param));
    return parsed.toString();
  } catch {
    return rawUrl.trim();
  }
}

async function extractJobMetadataWithGemini(rawText: string) {
  if (!process.env.GEMINI_API_KEY || !rawText || rawText.trim().length === 0) {
    return null;
  }
  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    const prompt = `Extract job details from the following web page content. Return strictly valid JSON with no markdown wrapping.
JSON Structure:
{
  "title": "Job Title",
  "company": "Company Name",
  "location": "Location or Remote",
  "salaryRange": "Salary info if present or null",
  "description": "Clean markdown formatted job description"
}

Web Page Content:
${rawText.slice(0, 15000)}`;

    const result = await model.generateContent(prompt);
    const text = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(text);
  } catch (err) {
    console.warn('Gemini metadata extraction failed:', err);
    return null;
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;
    const planTier = (session.user as any).planTier || 'FREE';
    const isPro = planTier === 'PRO';

    const body = await request.json();
    const { url: rawUrl, manualTitle, manualCompany, manualDescription, manualLocation } = body;

    if (!rawUrl && !manualDescription) {
      return NextResponse.json({ error: 'Job URL or description is required' }, { status: 400 });
    }

    const cleanUrl = rawUrl ? cleanJobUrl(rawUrl) : `manual-${Date.now()}@userjob`;

    // 1. Check if job already exists in DB by cleanUrl
    let job = rawUrl ? await prisma.job.findUnique({ where: { url: cleanUrl } }) : null;

    let title = manualTitle || job?.title || '';
    let company = manualCompany || job?.company || '';
    let location = manualLocation || job?.location || 'Remote';
    let salaryRange = job?.salaryRange || null;
    let description = manualDescription || job?.description || '';

    // If job does not exist and no manual description provided, attempt scraping
    if (!job && !manualDescription) {
      let rawHtml = '';
      let fetchSuccess = false;

      // Direct scrape
      try {
        const res = await gotScraping({
          url: cleanUrl,
          timeout: { request: 15000 },
          retry: { limit: 0 },
          throwHttpErrors: false,
        });
        if (res.statusCode >= 200 && res.statusCode < 300) {
          rawHtml = res.body.toString();
          if (!rawHtml.includes('Just a moment...') && !rawHtml.includes('cf-challenge-error-title')) {
            fetchSuccess = true;
          }
        }
      } catch (e: any) {
        console.warn(`Direct fetch failed for custom URL ${cleanUrl}: ${e.message}`);
      }

      // Proxy fallback via Scrape.do if direct fetch failed
      if (!fetchSuccess && process.env.SCRAPEDO_API_KEY) {
        try {
          const scrapeDoUrl = `http://api.scrape.do?token=${process.env.SCRAPEDO_API_KEY}&super=true&render=true&url=${encodeURIComponent(cleanUrl)}`;
          const sdRes = await gotScraping({
            url: scrapeDoUrl,
            timeout: { request: 30000 },
            retry: { limit: 0 },
          });
          if (sdRes.statusCode >= 200 && sdRes.statusCode < 300) {
            rawHtml = sdRes.body.toString();
            fetchSuccess = true;
          }
        } catch (sdErr: any) {
          console.warn(`Scrape.do fetch failed for custom URL ${cleanUrl}: ${sdErr.message}`);
        }
      }

      if (fetchSuccess && rawHtml) {
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

        // If metadata is incomplete or description is raw HTML, attempt Gemini extraction
        if ((!title || !company || description.includes('<')) && process.env.GEMINI_API_KEY) {
          const aiExtracted = await extractJobMetadataWithGemini(description || $('body').text());
          if (aiExtracted) {
            if (!title && aiExtracted.title) title = aiExtracted.title;
            if (!company && aiExtracted.company) company = aiExtracted.company;
            if (aiExtracted.location) location = aiExtracted.location;
            if (aiExtracted.salaryRange) salaryRange = aiExtracted.salaryRange;
            if (aiExtracted.description && aiExtracted.description.length > 50) {
              description = aiExtracted.description;
            }
          }
        }

        if (description && description.length > 50 && !description.includes('## ')) {
          description = await reformatJobDescriptionWithGemini(description);
        }
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
        }
      });
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
      automation_confidence: atsInfo.confidence,
      unlockedBySubmission: true,
      isPrivate: userJob.isPrivate,
    };

    return NextResponse.json({
      success: true,
      job: formattedJob,
      message: isPro
        ? 'Job added privately to your pipeline!'
        : 'Job added! +1 Free Resume & Cover Letter generation unlocked.'
    });

  } catch (error: any) {
    console.error('Error in /api/jobs/add-by-url:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

import { prisma } from './prisma';
import { getUserSettings } from './settings';
import { callDeepSeek } from './deepseek';
import { isDescriptionAdequate } from './jobFetcher';

export async function scoreJob(
    userId: string,
    jobId: string,
    jobTitle: string,
    jobDescription: string,
    prefetchedData?: { settings: any; feedbackData: any[] }
) {
    if (!process.env.DEEPSEEK_API_KEY && !process.env.GEMINI_API_KEY) {
        throw new Error('DEEPSEEK_API_KEY or GEMINI_API_KEY is missing.');
    }

    if (!isDescriptionAdequate(jobDescription)) {
        throw new Error('Cannot score job: Job description is inadequate or has not been downloaded.');
    }

    // Options 2 & 3: reuse pre-fetched batch data, or run both DB reads in parallel
    let settings: any;
    let feedbackData: any[];

    if (prefetchedData) {
        settings = prefetchedData.settings;
        feedbackData = prefetchedData.feedbackData;
    } else {
        [settings, feedbackData] = await Promise.all([
            getUserSettings(userId),
            prisma.jobFeedback.findMany({
                where: { userId },
                select: { feedbackType: true, reasons: true, job: { select: { title: true, company: true } } },
                orderBy: { createdAt: 'desc' },
                take: 10
            })
        ]);
    }

    const profileText = settings.profile || "Default Scoring Profile";

    // Helper to parse weights from the profile markdown
    const parseWeights = (profile: string) => {
        const defaults = {
            compensation: 0.20,
            productFit: 0.20,
            remoteFlexibility: 0.15,
            aiMaturity: 0.10,
            leadership: 0.10,
            growth: 0.10,
            culture: 0.10,
            techStack: 0.05
        };

        const getWeight = (regex: RegExp, def: number): number => {
            const match = profile.match(regex);
            if (match && match[1]) {
                const val = parseFloat(match[1]) / 100;
                return isNaN(val) ? def : val;
            }
            return def;
        };

        return {
            compensation: getWeight(/-\s*Compensation:\s*(\d+)%/i, defaults.compensation),
            productFit: getWeight(/-\s*(?:Product\s*Fit|ProductFit):\s*(\d+)%/i, defaults.productFit),
            remoteFlexibility: getWeight(/-\s*(?:Remote\s*Flexibility|RemoteFlexibility):\s*(\d+)%/i, defaults.remoteFlexibility),
            aiMaturity: getWeight(/-\s*(?:AI\s*Maturity|AIMaturity):\s*(\d+)%/i, defaults.aiMaturity),
            leadership: getWeight(/-\s*Leadership:\s*(\d+)%/i, defaults.leadership),
            growth: getWeight(/-\s*Growth:\s*(\d+)%/i, defaults.growth),
            culture: getWeight(/-\s*Culture:\s*(\d+)%/i, defaults.culture),
            techStack: getWeight(/-\s*(?:Tech\s*Stack|TechStack):\s*(\d+)%/i, defaults.techStack),
        };
    };

    const weights = parseWeights(profileText);

    let feedbackContext = "";
    if (feedbackData && feedbackData.length > 0) {
        feedbackContext = "CANDIDATE FEEDBACK HISTORY (CRITICAL):\n";
        feedbackContext += "The candidate has provided the following explicit feedback on past jobs. You MUST penalize jobs that share traits with the disliked jobs, and boost jobs that share traits with liked jobs.\n\n";
        
        feedbackData.forEach(f => {
            const jobTitle = f.job?.title || 'Unknown Job';
            const company = f.job?.company || 'Unknown Company';
            if (f.feedbackType === 'dislike') {
                const reasons = f.reasons && f.reasons.length > 0 ? f.reasons.join(', ') : 'General poor fit';
                feedbackContext += `- DISLIKED: ${jobTitle} at ${company}. Reasons: ${reasons}\n`;
            } else {
                feedbackContext += `- LIKED: ${jobTitle} at ${company}\n`;
            }
        });
    }

    const prompt = `You are an expert career coach AI evaluating a job opportunity for a candidate.
Evaluate the following Job Description based on these specific criteria and provide a score out of 100 for each category based on how well it aligns with the candidate's preferences.

CANDIDATE PROFILE & CRITERIA:
${profileText}

${feedbackContext}
JOB TITLE: ${jobTitle}
JOB DESCRIPTION:
${jobDescription}

Return a JSON object strictly matching this schema:
{
  "compensation_score": number (0-100),
  "product_fit_score": number (0-100),
  "remote_flexibility_score": number (0-100),
  "ai_maturity_score": number (0-100),
  "leadership_score": number (0-100),
  "growth_score": number (0-100),
  "culture_score": number (0-100),
  "tech_stack_score": number (0-100),
  "analysis_notes": "A short 2-3 sentence summary of why this score was given.",
  "extracted_salary": "String extracting the salary range if mentioned in the text (e.g. $100k-$150k), otherwise return null"
}`;

    const responseText = await callDeepSeek({
        model: 'deepseek-v4-flash',
        jsonMode: true,
        messages: [{ role: 'user', content: prompt }],
        userId,
        maxTokens: 1024 // Scoring output is compact JSON (~300 tokens typical); 1024 gives ample headroom without holding the connection open like the 8192 default
    });
    
    try {
        const cleanedText = responseText
            .replace(/```json\s*/gi, '')
            .replace(/```\s*$/gi, '')
            .trim();
        const scores = JSON.parse(cleanedText);
        
        const compScore = Number(scores.compensation_score ?? scores.compensationScore ?? 50);
        const prodScore = Number(scores.product_fit_score ?? scores.productFitScore ?? 50);
        const remoteScore = Number(scores.remote_flexibility_score ?? scores.remoteFlexibilityScore ?? 50);
        const aiScore = Number(scores.ai_maturity_score ?? scores.aiMaturityScore ?? 50);
        const leadScore = Number(scores.leadership_score ?? scores.leadershipScore ?? 50);
        const growthScore = Number(scores.growth_score ?? scores.growthScore ?? 50);
        const cultScore = Number(scores.culture_score ?? scores.cultureScore ?? 50);
        const techScore = Number(scores.tech_stack_score ?? scores.techStackScore ?? 50);

        // Calculate weighted total score using dynamic parsed weights
        const sumOfWeights = weights.compensation + weights.productFit + weights.remoteFlexibility + 
                             weights.aiMaturity + weights.leadership + weights.growth + 
                             weights.culture + weights.techStack;

        const rawWeightedScore = (
            (compScore * weights.compensation) +
            (prodScore * weights.productFit) +
            (remoteScore * weights.remoteFlexibility) +
            (aiScore * weights.aiMaturity) +
            (leadScore * weights.leadership) +
            (growthScore * weights.growth) +
            (cultScore * weights.culture) +
            (techScore * weights.techStack)
        );

        const totalScore = Math.round(sumOfWeights > 0 ? (rawWeightedScore / sumOfWeights) : rawWeightedScore);

        const scorePayload: any = {
            totalScore: totalScore,
            compensationScore: compScore,
            productFitScore: prodScore,
            remoteFlexibilityScore: remoteScore,
            aiMaturityScore: aiScore,
            leadershipScore: leadScore,
            growthScore: growthScore,
            cultureScore: cultScore,
            techStackScore: techScore,
            analysisNotes: scores.analysis_notes || scores.analysisNotes || 'Job alignment evaluated.'
        };

        const data = await prisma.opportunityScore.upsert({
            where: { userId_jobId: { userId: userId, jobId: jobId } },
            update: scorePayload,
            create: { jobId: jobId, userId: userId, ...scorePayload }
        });

        // Update the user's specific job relation to 'scored'
        await prisma.userJob.update({
            where: { userId_jobId: { userId: userId, jobId: jobId } },
            data: { status: 'scored' }
        });

        // If salary was extracted, update the global job record
        if (scores.extracted_salary) {
            await prisma.job.update({
                where: { id: jobId },
                data: { salaryRange: scores.extracted_salary }
            });
        }

        return { ...data, total_score: totalScore };

    } catch (e: any) {
        console.error('Failed to parse or save DeepSeek response', e);
        throw new Error('Failed to parse or save job score: ' + e.message);
    }
}

export async function extractJobsFromEmailText(
    emailText: string,
    options?: {
        searchKeyword?: string;
        jobLevel?: string;
        includeKeywords?: string;
        excludeKeywords?: string;
    }
) {
    if (!process.env.DEEPSEEK_API_KEY && !process.env.GEMINI_API_KEY) return [];

    let criteriaPrompt = '';
    if (options?.searchKeyword) {
        criteriaPrompt += `\nCANDIDATE PRIMARY CRITERIA:\n`;
        criteriaPrompt += `Target Job Title / Field: ${options.searchKeyword}\n`;
        if (options.jobLevel) criteriaPrompt += `Preferred Level: ${options.jobLevel}\n`;
        if (options.includeKeywords) criteriaPrompt += `Must Include Keywords: ${options.includeKeywords}\n`;
        if (options.excludeKeywords) criteriaPrompt += `Must Exclude Keywords: ${options.excludeKeywords}\n`;
        criteriaPrompt += `\nCRITICAL FILTERING INSTRUCTION: Only extract job postings that closely align with the candidate's target job title and field. STRICTLY IGNORE job postings for unrelated career tracks or industries (for example, if target is Software Engineer, IGNORE warehouse worker, store associate, driver, or administrative roles).\n`;
    }

    const prompt = `You are a highly accurate data extraction AI.
Extract job postings mentioned in the following email text that align with the candidate's criteria.
${criteriaPrompt}
Return a JSON array of objects strictly matching this schema:
[{
  "title": "Job Title (e.g. Senior Product Manager)",
  "company": "Company Name",
  "location": "Location (e.g. Remote, or city)",
  "url": "The link to the job posting",
  "description": "Any job description, summary text, skill tags, or key topics provided in the email text for this role (e.g., 'AI, Automation, B2B, Product management, SaaS'). Extract as much detail as possible.",
  "requirements": "A detailed list of requirements, skills, or qualifications mentioned in the email, if any.",
  "salary_range": "Salary range if mentioned in the email (e.g. $150k - $175k yearly), otherwise null"
}]

If there are no matching jobs, return an empty array [].

EMAIL TEXT:
${emailText.substring(0, 30000)}`;

    try {
        const responseText = await callDeepSeek({
            model: 'deepseek-v4-flash',
            jsonMode: true,
            messages: [{ role: 'user', content: prompt }]
        });
        const jobs = JSON.parse(responseText);
        return Array.isArray(jobs) ? jobs : [];
    } catch (e) {
        console.error("DeepSeek job extraction failed:", e);
        return [];
    }
}

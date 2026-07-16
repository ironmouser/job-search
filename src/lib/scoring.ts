import { GoogleGenerativeAI } from '@google/generative-ai';
import { prisma } from './prisma';
import { getUserSettings } from './settings';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export async function scoreJob(userId: string, jobId: string, jobTitle: string, jobDescription: string) {
    if (!process.env.GEMINI_API_KEY) {
        throw new Error('GEMINI_API_KEY is missing.');
    }

    const settings = await getUserSettings(userId);
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

    // Fetch recent feedback to inject into the prompt
    const feedbackData = await prisma.jobFeedback.findMany({
        where: { userId: userId },
        select: { feedbackType: true, reasons: true, job: { select: { title: true, company: true } } },
        orderBy: { createdAt: 'desc' },
        take: 10
    });

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

    const model = genAI.getGenerativeModel({ 
        model: 'gemini-3.1-flash-lite',
        generationConfig: {
            responseMimeType: "application/json",
        }
    });

    const prompt = `
You are an expert career coach AI evaluating a job opportunity for a candidate.
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
}
`;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    
    try {
        const scores = JSON.parse(responseText);
        
        // Calculate weighted total score using dynamic parsed weights
        const sumOfWeights = weights.compensation + weights.productFit + weights.remoteFlexibility + 
                             weights.aiMaturity + weights.leadership + weights.growth + 
                             weights.culture + weights.techStack;

        const rawWeightedScore = (
            (scores.compensation_score * weights.compensation) +
            (scores.product_fit_score * weights.productFit) +
            (scores.remote_flexibility_score * weights.remoteFlexibility) +
            (scores.ai_maturity_score * weights.aiMaturity) +
            (scores.leadership_score * weights.leadership) +
            (scores.growth_score * weights.growth) +
            (scores.culture_score * weights.culture) +
            (scores.tech_stack_score * weights.techStack)
        );

        const totalScore = Math.round(sumOfWeights > 0 ? (rawWeightedScore / sumOfWeights) : rawWeightedScore);

        const scorePayload: any = {
            totalScore: totalScore,
            compensationScore: scores.compensation_score,
            productFitScore: scores.product_fit_score,
            remoteFlexibilityScore: scores.remote_flexibility_score,
            aiMaturityScore: scores.ai_maturity_score,
            leadershipScore: scores.leadership_score,
            growthScore: scores.growth_score,
            cultureScore: scores.culture_score,
            techStackScore: scores.tech_stack_score,
            analysisNotes: scores.analysis_notes
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
        console.error('Failed to parse or save Gemini response', e);
        throw new Error('Failed to parse or save job score: ' + e.message);
    }
}

export async function extractJobsFromEmailText(emailText: string) {
    if (!process.env.GEMINI_API_KEY) return [];

    const model = genAI.getGenerativeModel({ 
        model: 'gemini-3.1-flash-lite',
        generationConfig: {
            responseMimeType: "application/json",
        }
    });

    const prompt = `
You are a highly accurate data extraction AI.
Extract all job postings mentioned in the following email text.

Return a JSON array of objects strictly matching this schema:
[{
  "title": "Job Title (e.g. Senior Product Manager)",
  "company": "Company Name",
  "location": "Location (e.g. Remote, or city)",
  "url": "The link to the job posting",
  "description": "The full, detailed job description provided in the email. Extract as much detail as possible.",
  "requirements": "A detailed list of requirements, skills, or qualifications mentioned in the email, if any."
}]

If there are no jobs, return an empty array [].

EMAIL TEXT:
${emailText.substring(0, 30000)}
`;

    try {
        const result = await model.generateContent(prompt);
        const jobs = JSON.parse(result.response.text());
        return Array.isArray(jobs) ? jobs : [];
    } catch (e) {
        console.error("Gemini job extraction failed:", e);
        return [];
    }
}

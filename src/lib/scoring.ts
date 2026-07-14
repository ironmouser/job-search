import { GoogleGenerativeAI } from '@google/generative-ai';
import { supabase } from './supabase';
import { getSettings } from './settings';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export async function scoreJob(jobId: string, jobTitle: string, jobDescription: string) {
    if (!process.env.GEMINI_API_KEY) {
        throw new Error('GEMINI_API_KEY is missing.');
    }

    const settings = await getSettings();
    const profileText = settings.profile || "Default Scoring Profile";

    // Fetch recent feedback to inject into the prompt
    const { data: feedbackData } = await supabase
        .from('job_feedback')
        .select('feedback_type, reasons, jobs(title, company)')
        .order('created_at', { ascending: false })
        .limit(10);

    let feedbackContext = "";
    if (feedbackData && feedbackData.length > 0) {
        feedbackContext = "CANDIDATE FEEDBACK HISTORY (CRITICAL):\n";
        feedbackContext += "The candidate has provided the following explicit feedback on past jobs. You MUST penalize jobs that share traits with the disliked jobs, and boost jobs that share traits with liked jobs.\n\n";
        
        feedbackData.forEach(f => {
            const jobTitle = (f.jobs as any)?.title || 'Unknown Job';
            const company = (f.jobs as any)?.company || 'Unknown Company';
            if (f.feedback_type === 'dislike') {
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
        
        // Calculate weighted total score
        const totalScore = Math.round(
            (scores.compensation_score * 0.20) +
            (scores.product_fit_score * 0.20) +
            (scores.remote_flexibility_score * 0.15) +
            (scores.ai_maturity_score * 0.10) +
            (scores.leadership_score * 0.10) +
            (scores.growth_score * 0.10) +
            (scores.culture_score * 0.10) +
            (scores.tech_stack_score * 0.05)
        );

        const scorePayload = {
            total_score: totalScore,
            compensation_score: scores.compensation_score,
            product_fit_score: scores.product_fit_score,
            remote_flexibility_score: scores.remote_flexibility_score,
            ai_maturity_score: scores.ai_maturity_score,
            leadership_score: scores.leadership_score,
            growth_score: scores.growth_score,
            culture_score: scores.culture_score,
            tech_stack_score: scores.tech_stack_score,
            analysis_notes: scores.analysis_notes
        };

        const { data: existing } = await supabase.from('opportunity_scores').select('id').eq('job_id', jobId).single();

        let data, error;
        if (existing) {
            const res = await supabase.from('opportunity_scores').update(scorePayload).eq('id', existing.id).select().single();
            data = res.data;
            error = res.error;
        } else {
            const res = await supabase.from('opportunity_scores').insert({ job_id: jobId, ...scorePayload }).select().single();
            data = res.data;
            error = res.error;
        }

        if (error) throw error;

        // Update the job status (and salary if extracted)
        const jobUpdatePayload: any = { status: 'scored' };
        if (scores.extracted_salary) {
            jobUpdatePayload.salary_range = scores.extracted_salary;
        }

        await supabase
            .from('jobs')
            .update(jobUpdatePayload)
            .eq('id', jobId);

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

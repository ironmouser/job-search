import Anthropic from '@anthropic-ai/sdk';
import { supabase } from './supabase';
import fs from 'fs';
import path from 'path';
import { getSettings } from './settings';

const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY || '',
});

export async function generateAssetsForJob(jobId: string, jobTitle: string, jobDescription: string, company: string) {
    if (!process.env.ANTHROPIC_API_KEY) {
        throw new Error('ANTHROPIC_API_KEY is missing.');
    }

    const settings = await getSettings();
    const driftPercentage = settings.resumeCustomizationMaxPercentage || 25;
    const tone = settings.aiStrictness || 'Standard';

    // Read the base resume
    const resumePath = path.join(process.cwd(), 'src/lib/base_resume.md');
    let baseResume = '';
    try {
        baseResume = fs.readFileSync(resumePath, 'utf8');
    } catch (e) {
        console.error("Failed to read base resume file.", e);
        throw new Error("Base resume not found at src/lib/base_resume.md");
    }

    const systemPrompt = `You are an expert career strategist and executive resume writer. 
Your goal is to tailor the candidate's resume, write a cover letter, and craft a networking message for a specific job.

CRITICAL GUARDRAILS:
1. NO HALLUCINATIONS: Do not invent experiences, metrics, or skills that are not present in the BASE RESUME.
2. MAXIMUM ${driftPercentage}% DRIFT: You may rephrase bullets to highlight relevant keywords from the job description, but the core truth and structure must remain intact.
3. TONE: ${tone === 'Strict' ? 'Extremely factual, dry, and strictly professional.' : tone === 'Creative' ? 'Bold, aggressive, highlighting impact and narrative.' : 'Confident, strategic, and concise.'}

Return the result as a JSON object with EXACTLY these keys:
{
  "tailored_resume": "Markdown string of the tailored resume",
  "cover_letter": "Markdown string of the tailored cover letter",
  "networking_message": "A short, 2-3 sentence LinkedIn connection request to the hiring manager or recruiter",
  "portfolio_recommendation": "A 1-2 sentence recommendation on which project from the resume to highlight in interviews"
}`;

    const userPrompt = `
COMPANY: ${company}
JOB TITLE: ${jobTitle}

JOB DESCRIPTION:
${jobDescription}

BASE RESUME:
${baseResume}
`;

    console.log(`Generating assets for ${company} - ${jobTitle}...`);

    const response = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4096,
        system: systemPrompt,
        messages: [
            { role: 'user', content: userPrompt }
        ],
    });

    console.log("ANTHROPIC RAW RESPONSE:", JSON.stringify(response, null, 2));
    const responseText = (response as any).content?.[0]?.text || '';
    
    if (!responseText) {
        throw new Error(`Anthropic response missing text content: ${JSON.stringify(response)}`);
    }

    // Extract just the JSON object from the response using regex to ignore conversational text
    const match = responseText.match(/\{[\s\S]*\}/);
    if (!match) {
        throw new Error('No JSON object found in the Claude response.');
    }
    const jsonString = match[0];

    try {
        const assets = JSON.parse(jsonString);

        // Save to Supabase
        const { data, error } = await supabase
            .from('application_assets')
            .insert({
                job_id: jobId,
                tailored_resume_markdown: assets.tailored_resume,
                cover_letter_markdown: assets.cover_letter,
                networking_message: assets.networking_message,
                portfolio_recommendation: assets.portfolio_recommendation
            })
            .select()
            .single();

        if (error) throw error;

        // Update job status
        await supabase
            .from('jobs')
            .update({ status: 'asset_generated' })
            .eq('id', jobId);

        return data;
    } catch (e: any) {
        console.error('Failed to parse or save Claude response', e);
        throw new Error('Failed to parse or save generated assets: ' + e.message);
    }
}

export async function generateApplicationAnswer(
    jobTitle: string, 
    jobDescription: string, 
    company: string, 
    question: string,
    tone?: string,
    instruction?: string
) {
    if (!process.env.ANTHROPIC_API_KEY) {
        throw new Error('ANTHROPIC_API_KEY is missing.');
    }

    const settings = await getSettings();
    const finalTone = tone || 'Confident and strategic';
    const profile = settings.profile || 'No profile specified.';
    const qaExamples: { question: string, answer: string }[] = settings.qaExamples || [];

    // Read the base resume
    const resumePath = path.join(process.cwd(), 'src/lib/base_resume.md');
    let baseResume = '';
    try {
        baseResume = fs.readFileSync(resumePath, 'utf8');
    } catch (e) {
        console.error("Failed to read base resume file.", e);
        throw new Error("Base resume not found at src/lib/base_resume.md");
    }

    let examplesText = '';
    if (qaExamples.length > 0) {
        examplesText = `\nUSER'S PREFERRED EXAMPLES (Learn from these style/length preferences):\n`;
        qaExamples.forEach((ex, i) => {
            examplesText += `Example ${i + 1}:\nQ: ${ex.question}\nA: ${ex.answer}\n\n`;
        });
    }

    let instructionText = '';
    if (instruction === 'shorter') {
        instructionText = 'CRITICAL: Make the response significantly shorter and more concise than typical.';
    } else if (instruction === 'longer') {
        instructionText = 'CRITICAL: Expand on the response, adding more detail and depth from the resume.';
    } else if (instruction === 'different') {
        instructionText = 'CRITICAL: Take a completely different approach or angle than a standard answer.';
    }

    const systemPrompt = `You are an expert career strategist and executive resume writer. 
Your goal is to answer a specific job application question on behalf of the candidate.

CRITICAL GUARDRAILS:
1. NO HALLUCINATIONS: Do not invent experiences, metrics, or skills that are not present in the BASE RESUME or TARGET PROFILE.
2. TONE: ${finalTone}
3. INSTRUCTION: ${instructionText || 'Answer the question directly and compellingly.'}

Output ONLY the answer to the question in plain text. Do not wrap it in JSON. Do not include any introductory or conversational text.`;

    const userPrompt = `
COMPANY: ${company}
JOB TITLE: ${jobTitle}

JOB DESCRIPTION:
${jobDescription}

TARGET PROFILE:
${profile}

BASE RESUME:
${baseResume}
${examplesText}

QUESTION TO ANSWER:
${question}
`;

    console.log(`Generating answer for question: "${question.substring(0, 30)}..." at ${company} (Tone: ${finalTone}, Instruction: ${instruction || 'none'})...`);

    const response = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2048,
        system: systemPrompt,
        messages: [
            { role: 'user', content: userPrompt }
        ],
    });

    const responseText = (response as any).content?.[0]?.text || '';
    
    if (!responseText) {
        throw new Error(`Anthropic response missing text content: ${JSON.stringify(response)}`);
    }

    return responseText.trim();
}

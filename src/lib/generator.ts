import { prisma } from './prisma';
import fs from 'fs';
import path from 'path';
import { getUserSettings } from './settings';
import { cleanCompanyName } from './cleaners';
import { callDeepSeek } from './deepseek';
import Anthropic from '@anthropic-ai/sdk';
import { checkAiSafeguard, logAiCost, estimateTokens } from './ai-safeguard';
import { COVER_LETTER_REFERENCE_EXAMPLES, NETWORKING_REFERENCE_EXAMPLES, QA_REFERENCE_EXAMPLES } from './ai-examples';

const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY || 'dummy_key',
});

async function callAiService(params: {
    system: string;
    userPrompt: string;
    maxTokens?: number;
    jsonMode?: boolean;
    userId?: string;
    temperature?: number;
    model?: string;
}): Promise<string> {
    const temp = params.temperature ?? 1.5;

    if (process.env.DEEPSEEK_API_KEY) {
        return await callDeepSeek({
            model: params.model || 'deepseek-chat',
            jsonMode: params.jsonMode,
            temperature: temp,
            maxTokens: params.maxTokens || 4096,
            userId: params.userId,
            messages: [
                { role: 'system', content: params.system },
                { role: 'user', content: params.userPrompt }
            ]
        });
    }

    if (process.env.ANTHROPIC_API_KEY) {
        const anthropicModel = 'claude-3-5-haiku-20241022';
        const promptText = params.system + params.userPrompt;
        const estimatedTokens = estimateTokens(promptText);
        const estimatedCost = (estimatedTokens / 1_000_000) * 0.25 + ((params.maxTokens || 2048) / 1_000_000) * 1.25;

        await checkAiSafeguard(estimatedCost, anthropicModel, params.userId);

        const response = await anthropic.messages.create({
            model: anthropicModel,
            max_tokens: params.maxTokens || 4096,
            temperature: Math.min(temp, 1.0),
            system: params.system,
            messages: [{ role: 'user', content: params.userPrompt }]
        });

        const usage = response.usage;
        if (usage) {
            await logAiCost(anthropicModel, usage.input_tokens, usage.output_tokens, params.userId);
        }

        return (response as any).content?.[0]?.text || '';
    }

    throw new Error('Neither DEEPSEEK_API_KEY nor ANTHROPIC_API_KEY is configured.');
}

export async function generateAssetsForJob(userId: string, jobId: string, jobTitle: string, jobDescription: string, company: string) {
    const cleanCompany = cleanCompanyName(company);
    const settings = await getUserSettings(userId);
    const driftPercentage = settings.resumeCustomizationMaxPercentage || 25;
    const tone = settings.aiStrictness || 'Standard';

    // Read the base resume
    let baseResume = settings.resumeMarkdown || '';
    if (!baseResume) {
        const resumePath = path.join(process.cwd(), 'src/lib/base_resume.md');
        try {
            baseResume = fs.readFileSync(resumePath, 'utf8');
        } catch (e) {
            console.error("Failed to read base resume file.", e);
            throw new Error("Base resume not found at src/lib/base_resume.md");
        }
    }

    const systemPrompt = `You are an expert career strategist and executive resume writer. Role-play as an experienced professional.
Your goal is to tailor the candidate's resume, write a cover letter, and craft a networking message for a specific job.

CRITICAL GUARDRAILS:
1. NO HALLUCINATIONS: Do not invent experiences, metrics, or skills that are not present in the BASE RESUME.
2. MAXIMUM ${driftPercentage}% DRIFT: You may rephrase bullets to highlight relevant keywords from the job description, but the core truth and structure must remain intact.
3. BALANCED HYPHEN USE & NO BUZZWORD STACKING (CRITICAL):
   - NO DASHES AS PUNCTUATION: Do NOT use em-dashes ("—" or "--") or hyphens ("-") as punctuation between clauses. Use commas, periods, or natural sentence transitions instead.
   - ALLOWED ENTERPRISE TERMS: Standard industry expressions like "customer-centric" and "cross-functional" are fully allowed and encouraged! Use them where natural and appropriate.
   - AVOID HYPHEN OVERUSE & BUZZWORD STACKING: Using hyphens occasionally is natural, but chaining multiple hyphenated compound modifiers in the same sentence draws attention as AI-generated text. Do not over-rely on repeating formulas like "AI-enabled," "results-oriented," or "high-impact" in every bullet point. Vary your phrasing (e.g., specifying actual teams rather than repeating "cross-functional" everywhere, or saying "products built with AI"). Keep the rhythm conversational, natural, and authentically human.
4. NO CLICHÉ AI FILLER: Avoid generic robotic words like "thrilled," "passionate," "dynamic," "testament to," "delve," or "leverage."
5. TONE AND ENERGY (CRITICAL): Write with genuine, human enthusiasm and upbeat energy! Your tone should be highly engaging, confident, and conversational—like a passionate professional writing directly to a respected colleague. Do not sound dry, corporate, or overly formal. Inject natural excitement about the opportunity while remaining professional. Use varied sentence structures to ensure a natural, human rhythm.

COVER LETTER STRUCTURE (CRITICAL):
Split into exactly three short paragraphs:
- Paragraph 1: Why I am applying and my highest-level qualification.
- Paragraph 2: Connect 2 specific metrics/projects/experience from my resume to the exact pain points mentioned in the job description.
- Paragraph 3: A direct call to action for an interview.

Return the result as a JSON object with EXACTLY these keys:
{
  "tailored_resume": "Markdown string of the tailored resume",
  "cover_letter": "ONLY the body paragraphs of the cover letter (split into exactly 3 short paragraphs as specified above). NO title, NO 'Dear...' salutation, NO header block, NO sign-off or signature (e.g. Sincerely). Start directly with Paragraph 1.",
  "networking_message": "A short, 2-3 sentence LinkedIn connection request to the hiring manager or recruiter",
  "portfolio_recommendation": "A 1-2 sentence recommendation on which project from the resume to highlight in interviews"
}`;

    const userPrompt = `
COMPANY: ${cleanCompany}
JOB TITLE: ${jobTitle}

JOB DESCRIPTION:
${jobDescription}

BASE RESUME:
${baseResume}

${COVER_LETTER_REFERENCE_EXAMPLES}

${NETWORKING_REFERENCE_EXAMPLES}
`;

    console.log(`Generating assets for ${company} - ${jobTitle}...`);

    let responseText = await callAiService({
        system: systemPrompt,
        userPrompt: userPrompt,
        maxTokens: 4096,
        jsonMode: true,
        userId: userId,
        temperature: 1.5
    });

    responseText = responseText.replace(/—/g, '-').replace(/–/g, '-').replace(/--/g, '-');

    let cleanedText = responseText.trim();
    if (cleanedText.startsWith('```')) {
        cleanedText = cleanedText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
    }

    const match = cleanedText.match(/\{[\s\S]*\}/);
    if (!match) {
        console.error('Failed to parse AI response as JSON. Raw response was:', responseText);
        throw new Error('No JSON object found in the AI response.');
    }
    const jsonString = match[0];

    try {
        const assets = JSON.parse(jsonString);

        const data = await prisma.applicationAsset.upsert({
            where: { userId_jobId: { userId, jobId } },
            update: {
                tailoredResumeMarkdown: assets.tailored_resume,
                coverLetterMarkdown: assets.cover_letter,
                networkingMessage: assets.networking_message,
                portfolioRecommendation: assets.portfolio_recommendation
            },
            create: {
                jobId: jobId,
                userId: userId,
                tailoredResumeMarkdown: assets.tailored_resume,
                coverLetterMarkdown: assets.cover_letter,
                networkingMessage: assets.networking_message,
                portfolioRecommendation: assets.portfolio_recommendation
            }
        });

        await prisma.userJob.update({
            where: { userId_jobId: { userId, jobId } },
            data: { status: 'asset_generated' }
        });

        return data;
    } catch (e: any) {
        console.error('Failed to parse or save AI response', e);
        throw new Error('Failed to parse or save generated assets: ' + e.message);
    }
}

export async function generateApplicationAnswer(
    userId: string,
    jobTitle: string, 
    jobDescription: string, 
    company: string, 
    question: string,
    tone?: string,
    instruction?: string
) {
    const cleanCompany = cleanCompanyName(company);
    const settings = await getUserSettings(userId);
    const finalTone = tone || 'Confident and strategic';
    const profile = settings.profile || 'No profile specified.';
    const qaExamples: { question: string, answer: string }[] = (settings as any).qaExamples || [];

    let baseResume = settings.resumeMarkdown || '';
    if (!baseResume) {
        const resumePath = path.join(process.cwd(), 'src/lib/base_resume.md');
        try {
            baseResume = fs.readFileSync(resumePath, 'utf8');
        } catch (e) {
            console.error("Failed to read base resume file.", e);
            throw new Error("Base resume not found at src/lib/base_resume.md");
        }
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

    const systemPrompt = `You are an expert career strategist and executive resume writer. Role-play as an experienced professional.
Your goal is to answer a specific job application question on behalf of the candidate.

CRITICAL GUARDRAILS:
1. NO HALLUCINATIONS: Do not invent experiences, metrics, or skills that are not present in the BASE RESUME or TARGET PROFILE.
2. LENGTH: Aim for around 65 words as a starting point, unless instructed otherwise.
3. BALANCED HYPHEN USE & NO BUZZWORD STACKING (CRITICAL):
   - NO DASHES AS PUNCTUATION: Do NOT use em-dashes ("—" or "--") or hyphens ("-") as punctuation between clauses. Use commas, periods, or natural sentence transitions instead.
   - ALLOWED ENTERPRISE TERMS: Standard industry expressions like "customer-centric" and "cross-functional" are fully allowed and encouraged! Use them where natural and appropriate.
   - AVOID HYPHEN OVERUSE & BUZZWORD STACKING: Using hyphens occasionally is natural, but chaining multiple hyphenated compound modifiers in the same sentence draws attention as AI-generated text. Do not over-rely on repeating formulas like "AI-enabled," "results-oriented," or "high-impact" in every bullet point. Vary your phrasing (e.g., specifying actual teams rather than repeating "cross-functional" everywhere, or saying "products built with AI"). Keep the rhythm conversational, natural, and authentically human.
4. NO CLICHÉ AI FILLER: Avoid generic robotic words like "thrilled," "passionate," "dynamic," "testament to," "delve," or "leverage."
5. TONE AND ENERGY (CRITICAL): Write with genuine, human enthusiasm and upbeat energy! Your tone should be highly engaging, confident, and conversational. Do not sound dry, corporate, or overly formal. Inject natural excitement while remaining professional. Use varied sentence structures to ensure a natural, human rhythm.
7. INSTRUCTION: ${instructionText || 'Answer the question directly and compellingly.'}

Output ONLY the answer to the question in plain text. Do not wrap it in JSON. Do not include any introductory or conversational text.`;

    const userPrompt = `
COMPANY: ${cleanCompany}
JOB TITLE: ${jobTitle}

JOB DESCRIPTION:
${jobDescription}

TARGET PROFILE:
${profile}

BASE RESUME:
${baseResume}
${examplesText}
${QA_REFERENCE_EXAMPLES}

QUESTION TO ANSWER:
${question}
`;

    let responseText = await callAiService({
        system: systemPrompt,
        userPrompt: userPrompt,
        maxTokens: 1024,
        userId: userId,
        temperature: 1.5,
        model: 'deepseek-v4-flash'
    });

    responseText = responseText.replace(/—/g, '-').replace(/–/g, '-').replace(/--/g, '-');
    return responseText.trim();
}

export async function getResumePrompts(userId: string, jobId: string, jobTitle: string, jobDescription: string, company: string, instruction?: string, customizationAmount?: number) {
    const settings = await getUserSettings(userId);
    const driftPercentage = customizationAmount !== undefined ? customizationAmount : (settings.resumeCustomizationMaxPercentage || 25);
    
    let baseResume = settings.resumeMarkdown || '';
    if (!baseResume) {
        try { baseResume = fs.readFileSync(path.join(process.cwd(), 'src/lib/base_resume.md'), 'utf8'); } catch (e) {}
    }

    let instructionText = '';
    if (instruction === 'different') {
        instructionText = 'CRITICAL: Take a completely different approach or angle than a standard tailoring.';
    }

    const systemPrompt = `You are an expert career strategist and executive resume writer. Role-play as an experienced professional.
Your goal is to tailor the candidate's resume for a specific job.

CRITICAL GUARDRAILS:
1. NO HALLUCINATIONS: Do not invent experiences, metrics, or skills that are not present in the BASE RESUME.
2. MAXIMUM ${driftPercentage}% DRIFT: You may rephrase bullets to highlight relevant keywords from the job description, but the core truth and structure must remain intact.
3. BALANCED HYPHEN USE & NO BUZZWORD STACKING (CRITICAL):
   - NO DASHES AS PUNCTUATION: Do NOT use em-dashes ("—" or "--") or hyphens ("-") as punctuation between clauses. Use commas, periods, or natural sentence transitions instead.
   - ALLOWED ENTERPRISE TERMS: Standard industry expressions like "customer-centric" and "cross-functional" are fully allowed and encouraged! Use them where natural and appropriate.
   - AVOID HYPHEN OVERUSE & BUZZWORD STACKING: Using hyphens occasionally is natural, but chaining multiple hyphenated compound modifiers in the same sentence draws attention as AI-generated text. Do not over-rely on repeating formulas like "AI-enabled," "results-oriented," or "high-impact" in every bullet point. Vary your phrasing (e.g., specifying actual teams rather than repeating "cross-functional" everywhere, or saying "products built with AI"). Keep the rhythm conversational, natural, and authentically human.
4. NO CLICHÉ AI FILLER: Avoid generic robotic words like "thrilled," "passionate," "dynamic," "testament to," "delve," or "leverage."
5. TONE AND ENERGY (CRITICAL): Write with genuine, human enthusiasm and upbeat energy! Your tone should be highly engaging, confident, and conversational. Do not sound dry, corporate, or overly formal. Inject natural excitement while remaining professional. Use varied sentence structures to ensure a natural, human rhythm.
6. INSTRUCTION: ${instructionText || 'Tailor the resume to the job description.'}

Output ONLY the Markdown string of the tailored resume in plain text. Do not wrap it in JSON or Markdown blocks like \`\`\`markdown.`;

    const cleanCompany = cleanCompanyName(company);
    const userPrompt = `COMPANY: ${cleanCompany}\nJOB TITLE: ${jobTitle}\n\nJOB DESCRIPTION:\n${jobDescription}\n\nBASE RESUME:\n${baseResume}`;
    return { systemPrompt, userPrompt };
}

export async function regenerateResume(userId: string, jobId: string, jobTitle: string, jobDescription: string, company: string, instruction?: string, customizationAmount?: number) {
    const { systemPrompt, userPrompt } = await getResumePrompts(userId, jobId, jobTitle, jobDescription, company, instruction, customizationAmount);
    
    let responseText = await callAiService({
        system: systemPrompt,
        userPrompt: userPrompt,
        maxTokens: 4096,
        userId: userId,
        temperature: 1.5,
        model: 'deepseek-v4-flash'
    });
    responseText = responseText.replace(/—/g, '-').replace(/–/g, '-').replace(/--/g, '-');
    return responseText.trim();
}

export async function getCoverLetterPrompts(userId: string, jobTitle: string, jobDescription: string, company: string, instruction?: string, tone?: string) {
    const settings = await getUserSettings(userId);
    const finalTone = tone || 'Confident and strategic';
    
    let baseResume = settings.resumeMarkdown || '';
    if (!baseResume) {
        try { baseResume = fs.readFileSync(path.join(process.cwd(), 'src/lib/base_resume.md'), 'utf8'); } catch (e) {}
    }

    let instructionText = '';
    if (instruction === 'shorter') instructionText = 'CRITICAL: Make the cover letter significantly shorter and more concise.';
    else if (instruction === 'longer') instructionText = 'CRITICAL: Expand on the cover letter, adding more detail and depth from the resume.';
    else if (instruction === 'different') instructionText = 'CRITICAL: Take a completely different approach or angle.';

    const systemPrompt = `You are an expert career strategist. Role-play as an experienced professional. Write a tailored cover letter body for a specific job.
CRITICAL GUARDRAILS:
1. NO HALLUCINATIONS.
2. COVER LETTER STRUCTURE: Split into exactly three short paragraphs:
   - Paragraph 1: Why I am applying and my highest-level qualification.
   - Paragraph 2: Connect 2 specific metrics/projects/experience from my resume to the exact pain points mentioned in the job description.
   - Paragraph 3: A direct call to action for an interview.
3. BALANCED HYPHEN USE & NO BUZZWORD STACKING (CRITICAL):
   - NO DASHES AS PUNCTUATION: Do NOT use em-dashes ("—" or "--") or hyphens ("-") as punctuation between clauses. Use commas, periods, or natural sentence transitions instead.
   - ALLOWED ENTERPRISE TERMS: Standard industry expressions like "customer-centric" and "cross-functional" are fully allowed and encouraged! Use them where natural and appropriate.
   - AVOID HYPHEN OVERUSE & BUZZWORD STACKING: Using hyphens occasionally is natural, but chaining multiple hyphenated compound modifiers in the same sentence draws attention as AI-generated text. Do not over-rely on repeating formulas like "AI-enabled," "results-oriented," or "high-impact" in every bullet point. Vary your phrasing (e.g., specifying actual teams rather than repeating "cross-functional" everywhere, or saying "products built with AI"). Keep the rhythm conversational, natural, and authentically human.
4. NO CLICHÉ AI FILLER: Avoid generic robotic words like "thrilled," "passionate," "dynamic," "testament to," "delve," or "leverage."
5. TONE AND ENERGY (CRITICAL): Write with genuine, human enthusiasm and upbeat energy! Your tone should be highly engaging, confident, and conversational—like a passionate professional writing directly to a respected colleague. Do not sound dry, corporate, or overly formal. Inject natural excitement about the opportunity while remaining professional. Use varied sentence structures to ensure a natural, human rhythm.
7. INSTRUCTION: ${instructionText || 'Write a compelling cover letter body.'}
8. OUTPUT FORMAT: Output ONLY the 3 body paragraphs. Do NOT include a title (e.g. "Cover Letter"), do NOT include a salutation ("Dear..."), do NOT include a header block, do NOT include a sign-off (e.g. "Sincerely,") or signature block. Start directly with paragraph 1.

Output ONLY the cover letter body in plain text (no JSON wrapping).`;

    const cleanCompany = cleanCompanyName(company);
    const userPrompt = `COMPANY: ${cleanCompany}\nJOB TITLE: ${jobTitle}\n\nJOB DESCRIPTION:\n${jobDescription}\n\nBASE RESUME:\n${baseResume}\n\n${COVER_LETTER_REFERENCE_EXAMPLES}`;
    return { systemPrompt, userPrompt };
}

export async function regenerateCoverLetter(userId: string, jobId: string, jobTitle: string, jobDescription: string, company: string, instruction?: string, tone?: string) {
    const { systemPrompt, userPrompt } = await getCoverLetterPrompts(userId, jobTitle, jobDescription, company, instruction, tone);
    
    let responseText = await callAiService({
        system: systemPrompt,
        userPrompt: userPrompt,
        maxTokens: 1024,
        userId: userId,
        temperature: 1.5,
        model: 'deepseek-v4-flash'
    });
    responseText = responseText.replace(/—/g, '-').replace(/–/g, '-').replace(/--/g, '-');
    return responseText.trim();
}

export async function getNetworkingMessagePrompts(userId: string, jobTitle: string, jobDescription: string, company: string, instruction?: string, tone?: string) {
    const settings = await getUserSettings(userId);
    const finalTone = tone || 'Confident and strategic';
    
    let baseResume = settings.resumeMarkdown || '';
    if (!baseResume) {
        try { baseResume = fs.readFileSync(path.join(process.cwd(), 'src/lib/base_resume.md'), 'utf8'); } catch (e) {}
    }

    let instructionText = '';
    if (instruction === 'shorter') instructionText = 'CRITICAL: Make the message significantly shorter (LinkedIn connection request length).';
    else if (instruction === 'longer') instructionText = 'CRITICAL: Expand the message slightly (LinkedIn InMail or cold email length).';
    else if (instruction === 'different') instructionText = 'CRITICAL: Take a completely different approach or angle.';

    const systemPrompt = `You are an expert career strategist. Role-play as an experienced professional. Write a short networking message to the hiring manager or recruiter.
CRITICAL GUARDRAILS:
1. NO HALLUCINATIONS.
2. TONE AND ENERGY (CRITICAL): Write with genuine, human enthusiasm and upbeat energy! Your tone should be highly engaging, confident, and conversational—like a passionate professional writing directly to a respected colleague. Do not sound dry, corporate, or overly formal. Inject natural excitement about the opportunity while remaining professional. Use varied sentence structures to ensure a natural, human rhythm.
3. BALANCED HYPHEN USE & NO BUZZWORD STACKING (CRITICAL):
   - NO DASHES AS PUNCTUATION: Do NOT use em-dashes ("—" or "--") or hyphens ("-") as punctuation between clauses. Use commas, periods, or natural sentence transitions instead.
   - ALLOWED ENTERPRISE TERMS: Standard industry expressions like "customer-centric" and "cross-functional" are fully allowed and encouraged! Use them where natural and appropriate.
   - AVOID HYPHEN OVERUSE & BUZZWORD STACKING: Using hyphens occasionally is natural, but chaining multiple hyphenated compound modifiers in the same sentence draws attention as AI-generated text. Do not over-rely on repeating formulas like "AI-enabled," "results-oriented," or "high-impact" in every bullet point. Vary your phrasing (e.g., specifying actual teams rather than repeating "cross-functional" everywhere, or saying "products built with AI"). Keep the rhythm conversational, natural, and authentically human.
4. NO CLICHÉ AI FILLER: Avoid generic robotic words like "thrilled," "passionate," "dynamic," "testament to," "delve," or "leverage."
6. INSTRUCTION: ${instructionText || 'Write a 2-3 sentence connection request.'}

Output ONLY the text of the networking message. Do not wrap it in JSON.`;

    const cleanCompany = cleanCompanyName(company);
    const userPrompt = `COMPANY: ${cleanCompany}\nJOB TITLE: ${jobTitle}\n\nJOB DESCRIPTION:\n${jobDescription}\n\nBASE RESUME:\n${baseResume}\n\n${NETWORKING_REFERENCE_EXAMPLES}`;
    return { systemPrompt, userPrompt };
}

export async function regenerateNetworkingMessage(userId: string, jobId: string, jobTitle: string, jobDescription: string, company: string, instruction?: string, tone?: string) {
    const { systemPrompt, userPrompt } = await getNetworkingMessagePrompts(userId, jobTitle, jobDescription, company, instruction, tone);
    
    let responseText = await callAiService({
        system: systemPrompt,
        userPrompt: userPrompt,
        maxTokens: 1024,
        userId: userId,
        temperature: 1.5,
        model: 'deepseek-v4-flash'
    });
    responseText = responseText.replace(/—/g, '-').replace(/–/g, '-').replace(/--/g, '-');
    return responseText.trim();
}

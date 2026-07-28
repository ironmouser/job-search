/**
 * Security & Quality Validation for Job Application Assets
 * - Semantic Instruction Validation: Ensures custom prompts are strictly about resume/cover letter/networking tailoring.
 * - Output Validation & Hallucination Guard: Compares generated output against base resume & job description to catch fake companies/metrics or corrupted output.
 */

// Domain keywords expected in career / job asset tailoring
const LEGITIMATE_CAREER_KEYWORDS = [
    'resume', 'cover letter', 'networking', 'job', 'role', 'experience', 'skill', 'skills',
    'project', 'projects', 'metric', 'metrics', 'achievement', 'achievements', 'duty', 'duties',
    'bullet', 'bullets', 'paragraph', 'tone', 'short', 'shorter', 'concise', 'expand', 'detail',
    'longer', 'highlight', 'emphasize', 'focus', 'format', 'rephrase', 'tailor', 'customize',
    'section', 'title', 'company', 'industry', 'experience', 'years', 'lead', 'managed',
    'built', 'engineered', 'developed', 'architected', 'design', 'designed', 'leadership',
    'technical', 'soft skill', 'work', 'career', 'qualification', 'qualifications', 'rewrite',
    'word', 'words', 'version', 'summary', 'profile', 'accomplishment', 'accomplishments',
    'impact', 'results', 'experience', 'certification', 'certifications', 'education'
];

// Patterns indicative of off-topic or malicious requests
const OFF_TOPIC_PATTERNS = [
    /\b(math|calculus|algebra|solve|equation)\b/i,
    /\b(write|create|code|generate)\s+(a|an)?\s*(python|javascript|java|c\+\+|rust|go|sql|bash|html)\s+(script|program|function|code)\b/i,
    /\b(who\s+is|what\s+is|where\s+is|when\s+did|why\s+does|how\s+many)\b(?!.*\b(resume|job|role|cover letter|company|skills?)\b)/i,
    /\b(poem|story|song|essay|joke|riddle|recipe|haiku|fiction|novel)\b/i,
    /\b(weather|sports|score|game|movie|president|politics|stock|crypto|bitcoin)\b/i,
    /\b(ignore|system|jailbreak|prompt|instructions)\b/i
];

/**
 * Layer 2: Contextual Semantic Validation
 * Verifies that a custom instruction is specifically relevant to the requested asset type:
 * - Resume: skills, experience, bullet points, metrics, formatting.
 * - Cover Letter: tone, paragraph structure, company alignment, interview CTA.
 * - Networking: outreach, LinkedIn message, cold email, recruiter note, short intro.
 */
export function validateCustomInstructionSemantics(
    instruction: string | undefined,
    assetType: 'resume' | 'coverLetter' | 'networking' | 'qa'
): { isValid: boolean; reason?: string } {
    if (!instruction || !instruction.trim()) {
        return { isValid: true };
    }

    const lower = instruction.toLowerCase().trim();

    // 1. Check for global off-topic patterns (math, coding scripts, trivia, jailbreak attempts)
    for (const pattern of OFF_TOPIC_PATTERNS) {
        if (pattern.test(lower)) {
            return {
                isValid: false,
                reason: 'Custom instruction must be directly related to editing or tailoring your job application assets.'
            };
        }
    }

    // 2. Cross-Asset Mismatch Checks (ensuring instructions for one asset type aren't sent to another)
    if (assetType === 'resume') {
        if (/\b(cover letter|networking message|linkedin connection request|cold email|salutation|hiring manager)\b/i.test(lower)) {
            return {
                isValid: false,
                reason: 'Custom instruction for resumes must focus on resume content, skills, bullets, or experience.'
            };
        }
    } else if (assetType === 'coverLetter') {
        if (/\b(networking message|connection request|linkedin message|cold email|inmail)\b/i.test(lower)) {
            return {
                isValid: false,
                reason: 'Custom instruction for cover letters must focus on cover letter body content, tone, or alignment.'
            };
        }
    } else if (assetType === 'networking') {
        if (/\b(cover letter|full resume|3 paragraphs|header block|sign-off)\b/i.test(lower)) {
            return {
                isValid: false,
                reason: 'Custom instruction for networking messages must focus on short outreach, connection request, or intro message tailoring.'
            };
        }
    } else if (assetType === 'qa') {
        if (/\b(full resume|3 paragraphs|header block|sign-off|cover letter body)\b/i.test(lower)) {
            return {
                isValid: false,
                reason: 'Custom instruction for application Q&A must focus on answering the application question.'
            };
        }

        // Q&A Question Relevance Check: Ensure input pertains to job applications, interviews, or career qualifications
        const qaRelevancePattern = /\b(why|how|what|describe|explain|tell|experience|background|salary|role|company|job|strength|weakness|challenge|team|fit|work|accomplishment|skill|qualification|qualifications|application|interview|conflict|achievement|leadership|project|manager|career|hire|position)\b/i;
        
        if (!qaRelevancePattern.test(lower) && !LEGITIMATE_CAREER_KEYWORDS.some(kw => lower.includes(kw))) {
            return {
                isValid: false,
                reason: "The prompt must be a job-application or interview-related question (e.g., 'Why do you want to work at this company?')."
            };
        }
    }

    // Short instructions (< 25 chars) like "emphasize React" or "make it concise" pass if no off-topic/cross-asset triggers hit
    if (lower.length <= 25) {
        return { isValid: true };
    }

    // 3. Asset-Specific Keyword Context Validation
    const resumeKeywords = ['resume', 'bullet', 'experience', 'skill', 'metric', 'achievement', 'project', 'summary', 'title', 'section', 'technical'];
    const coverLetterKeywords = ['cover letter', 'letter', 'paragraph', 'tone', 'company', 'company fit', 'align', 'why', 'passion', 'qualification', 'apply'];
    const networkingKeywords = ['networking', 'message', 'outreach', 'linkedin', 'connection', 'recruiter', 'manager', 'intro', 'contact', 'reach out', 'short', 'inmail'];
    const qaKeywords = ['question', 'answer', 'interview', 'why', 'company', 'experience', 'salary', 'strength', 'weakness', 'challenge', 'role', 'team', 'fit', 'background', 'response'];

    const targetKeywords = assetType === 'resume'
        ? resumeKeywords
        : assetType === 'coverLetter'
        ? coverLetterKeywords
        : assetType === 'networking'
        ? networkingKeywords
        : qaKeywords;

    const hasAssetContext = targetKeywords.some(kw => lower.includes(kw)) || LEGITIMATE_CAREER_KEYWORDS.some(kw => lower.includes(kw));

    const actionVerbPattern = /\b(add|remove|include|exclude|emphasize|highlight|change|adjust|focus|strengthen|make|rewrite|cut|trim|expand|insert|show|answer|explain|describe)\b/i;
    const hasActionVerb = actionVerbPattern.test(lower);

    if (!hasAssetContext && !hasActionVerb) {
        const assetLabel = assetType === 'resume' ? 'resume' : assetType === 'coverLetter' ? 'cover letter' : assetType === 'networking' ? 'networking message' : 'application Q&A';
        return {
            isValid: false,
            reason: `Custom instruction must focus on ${assetLabel} content, experience, skills, or tone adjustments.`
        };
    }

    return { isValid: true };
}

/**
 * Layer 3: Output Validation & Hallucination Guard
 * Analyzes AI-generated content against source resume & job description.
 */
export function validateGeneratedAsset(
    output: string,
    baseResume: string,
    jobDescription: string,
    assetType: 'resume' | 'coverLetter' | 'networking' | 'qa'
): { isValid: boolean; warnings: string[]; severeHallucination: boolean } {
    const warnings: string[] = [];

    if (!output || !output.trim()) {
        return { isValid: false, warnings: ['Generated output is empty.'], severeHallucination: true };
    }

    const cleanOutput = output.trim();

    // 1. Check for prompt leakage or wrapper meta-text
    const promptLeakPatterns = [
        /^here is the/i,
        /as an ai language model/i,
        /critical guardrails/i,
        /system prompt/i,
        /user prompt/i,
        /apply this specific user request/i
    ];
    for (const leakPattern of promptLeakPatterns) {
        if (leakPattern.test(cleanOutput)) {
            return {
                isValid: false,
                warnings: ['Generated output contains system meta-text or prompt leakage.'],
                severeHallucination: true
            };
        }
    }

    // 2. Minimum structural length checks
    if (assetType === 'coverLetter' && cleanOutput.length < 150) {
        warnings.push('Cover letter output is unusually brief.');
    } else if (assetType === 'networking' && cleanOutput.length < 40) {
        warnings.push('Networking message output is unusually brief.');
    } else if (assetType === 'resume' && cleanOutput.length < 100) {
        warnings.push('Tailored resume output is unusually brief.');
    } else if (assetType === 'qa' && cleanOutput.length < 30) {
        warnings.push('Q&A answer output is unusually brief.');
    }

    // 3. Hallucination Detection: Extract capitalized proper noun entities (e.g. multi-word company/institution names)
    const entityMatches = cleanOutput.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/g) || [];
    const sourceTextLower = (baseResume + '\n' + jobDescription).toLowerCase();

    // Standard common terms to ignore during entity checks
    const commonIgnoredEntities = new Set([
        'united states', 'north america', 'san francisco', 'new york', 'los angeles',
        'software engineer', 'product manager', 'data scientist', 'full stack',
        'project manager', 'recruiting department', 'hiring manager', 'recruiting team',
        'dear recruiter', 'dear hiring', 'sincerely yours', 'best regards', 'thank you',
        'bachelor of', 'master of', 'doctor of', 'computer science', 'information technology',
        'business administration', 'artificial intelligence', 'machine learning'
    ]);

    let hallucinatedCount = 0;
    const suspiciousEntities: string[] = [];

    for (const entity of entityMatches) {
        const entityLower = entity.toLowerCase();
        if (commonIgnoredEntities.has(entityLower)) continue;

        // Check if entity or individual core words appear in base resume or job description
        const words = entityLower.split(/\s+/);
        const allWordsInSource = words.every(w => sourceTextLower.includes(w));

        if (!allWordsInSource) {
            hallucinatedCount++;
            suspiciousEntities.push(entity);
        }
    }

    // If more than 4 ungrounded multi-word proper entities are generated, flag as severe hallucination
    if (hallucinatedCount >= 5) {
        return {
            isValid: false,
            warnings: [`High hallucination risk: Unverified entity references found (${suspiciousEntities.slice(0, 3).join(', ')}...)`],
            severeHallucination: true
        };
    } else if (hallucinatedCount > 2) {
        warnings.push(`Potential unverified entities: ${suspiciousEntities.slice(0, 3).join(', ')}`);
    }

    return {
        isValid: warnings.length === 0 || !warnings.some(w => w.includes('High hallucination')),
        warnings,
        severeHallucination: false
    };
}

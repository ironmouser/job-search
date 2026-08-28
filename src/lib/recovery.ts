import { prisma } from './prisma';

/**
 * Known invalid title phrases or scraper noise to reject.
 */
const INVALID_TITLE_PATTERNS = [
    /face deduplication/i,
    /collection/i,
    /confidential/i,
    /various positions/i,
    /multiple openings/i,
    /urgent hiring/i,
    /immediate start/i,
    /apply now/i,
    /remote job/i,
    /work from home/i,
    /click here/i,
];

/**
 * Clean up and strictly validate an extracted job title.
 * Returns null if the string is ambiguous, noisy, or invalid.
 */
function cleanExtractedTitle(raw: string): string | null {
    if (!raw) return null;
    let title = raw
        .replace(/[*_#`]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

    // Strip trailing punctuation
    title = title.split(/[.,;\n]/)[0].trim();

    // Strip company / location suffixes like " at Acme Corp" or " | Remote"
    if (title.includes(' | ')) {
        title = title.split(' | ')[0].trim();
    }
    if (title.toLowerCase().includes(' at ')) {
        title = title.split(/\s+at\s+/i)[0].trim();
    }

    // Must be reasonable length and not contain emails/urls
    if (!title || title.length < 3 || title.length > 60 || title.includes('@') || title.includes('http')) {
        return null;
    }

    // Reject known scraper noise or collection keywords
    for (const pattern of INVALID_TITLE_PATTERNS) {
        if (pattern.test(title)) {
            return null;
        }
    }

    return title;
}

/**
 * Extracts a target job title ONLY from high-confidence, explicitly defined profile goals or resume headers.
 * Never guesses from project sections or job search results.
 */
export function extractJobTitleFromProfileOrResume(profile?: string | null, resumeMarkdown?: string | null): string | null {
    // 1. High-confidence: Target Profile Rubric generated during Onboarding
    if (profile && typeof profile === 'string' && profile.trim()) {
        const p = profile.trim();

        // Exact match from standard onboarding rubric: Seeking high-growth tech opportunities as a <TITLE>.
        const goalMatch = p.match(/Seeking high-growth(?: tech)? opportunities as an?\s+([^.\n#]+)/i);
        if (goalMatch) {
            const cleaned = cleanExtractedTitle(goalMatch[1]);
            if (cleaned) return cleaned;
        }

        // Target Role / Target Job Title key-values in custom candidate profiles
        const targetRoleMatch = p.match(/(?:Target Role|Target Job Title|Target Job|Target Position):\s*([^\n#]+)/i);
        if (targetRoleMatch) {
            const cleaned = cleanExtractedTitle(targetRoleMatch[1]);
            if (cleaned) return cleaned;
        }

        // Direct statement: Seeking opportunities / roles as a <TITLE>
        const seekingMatch = p.match(/Seeking\s+(?:opportunities|roles?|positions?)\s+as\s+an?\s+([^.\n#]+)/i);
        if (seekingMatch) {
            const cleaned = cleanExtractedTitle(seekingMatch[1]);
            if (cleaned) return cleaned;
        }
    }

    // 2. High-confidence: Candidate Headline right beneath Name header in Resume
    if (resumeMarkdown && typeof resumeMarkdown === 'string' && resumeMarkdown.trim()) {
        const lines = resumeMarkdown.trim().split('\n').map(l => l.trim()).filter(Boolean);

        const SECTION_HEADER_KEYWORDS = [
            'summary', 'experience', 'education', 'skills', 'strengths',
            'competencies', 'certifications', 'licenses', 'projects',
            'profile', 'objective', 'history', 'background', 'contact'
        ];

        for (let i = 0; i < Math.min(lines.length, 6); i++) {
            const line = lines[i];
            if (/^#{1,2}\s+[A-Za-z]/.test(line)) {
                for (let j = i + 1; j <= Math.min(lines.length - 1, i + 4); j++) {
                    const rawLine = lines[j];
                    // Skip if this line is another markdown header (e.g. ### PROFESSIONAL SUMMARY)
                    if (rawLine.startsWith('#')) {
                        continue;
                    }
                    const candidateLine = rawLine.replace(/[*_#`]/g, '').trim();
                    const lower = candidateLine.toLowerCase();

                    const isSectionHeader = SECTION_HEADER_KEYWORDS.some(k => 
                        lower === k || lower.startsWith(k + ' ') || lower.endsWith(' ' + k) || lower.includes('professional summary') || lower.includes('work experience')
                    );

                    if (
                        candidateLine &&
                        !isSectionHeader &&
                        !candidateLine.includes('@') &&
                        !candidateLine.includes('http') &&
                        !candidateLine.includes('linkedin.com') &&
                        !/\d{3}[-.]?\d{3}/.test(candidateLine) &&
                        !lower.startsWith('phone') &&
                        !lower.startsWith('email') &&
                        !lower.includes('clearance') &&
                        !lower.includes('united states') &&
                        !lower.includes('driver')
                    ) {
                        const cleaned = cleanExtractedTitle(candidateLine);
                        if (cleaned) return cleaned;
                    }
                }
            }
        }

        // 3. Fallback: First job title under Professional Experience section
        const expIndex = lines.findIndex(l => /^(?:#{1,3}\s+)?(?:PROFESSIONAL EXPERIENCE|EXPERIENCE|WORK HISTORY)/i.test(l));
        if (expIndex !== -1) {
            for (let i = expIndex + 1; i <= Math.min(lines.length - 1, expIndex + 8); i++) {
                const line = lines[i];
                // Match lines formatted as **Title | Company ...** or **Title**, Company
                const boldMatch = line.match(/^\*\*([^*]+?)\*\*/);
                if (boldMatch) {
                    const candidateRole = boldMatch[1].trim();
                    const cleaned = cleanExtractedTitle(candidateRole);
                    if (cleaned) return cleaned;
                }
            }
        }
    }

    return null;
}

/**
 * Batch scans all users, corrects any invalid/hallucinated job titles (such as "Face Deduplication Collection"),
 * and restores legitimate target titles strictly from verified profile goals and resume headlines.
 */
export async function restoreMissingJobTitles(): Promise<{
    restoredCount: number;
    cleanedCount: number;
    restoredUsers: Array<{ userId: string; email: string | null; restoredTitle: string }>;
}> {
    const allUsers = await prisma.user.findMany({
        select: {
            id: true,
            email: true,
            userPreferences: true,
        }
    });

    const restoredUsers: Array<{ userId: string; email: string | null; restoredTitle: string }> = [];
    let cleanedCount = 0;

    for (const u of allUsers) {
        const rawKeyword = u.userPreferences?.searchKeyword?.trim();
        const isCorrupted = rawKeyword ? INVALID_TITLE_PATTERNS.some(p => p.test(rawKeyword)) : false;

        if (isCorrupted && u.userPreferences) {
            // Reset corrupted/erroneous title
            await prisma.userPreferences.update({
                where: { id: u.userPreferences.id },
                data: { searchKeyword: null }
            });
            cleanedCount++;
        }

        // Only restore if keyword is empty/null or was just cleaned
        const needsRestoration = !rawKeyword || isCorrupted;
        if (!needsRestoration) {
            continue;
        }

        // High-confidence extraction only
        const verifiedTitle = extractJobTitleFromProfileOrResume(
            u.userPreferences?.profile,
            u.userPreferences?.resumeMarkdown
        );

        if (verifiedTitle) {
            if (u.userPreferences) {
                await prisma.userPreferences.update({
                    where: { id: u.userPreferences.id },
                    data: { searchKeyword: verifiedTitle }
                });
            } else {
                await prisma.userPreferences.create({
                    data: {
                        userId: u.id,
                        searchKeyword: verifiedTitle,
                        jobLevel: 'Mid-level',
                        theme: 'light',
                    }
                });
            }

            restoredUsers.push({
                userId: u.id,
                email: u.email || null,
                restoredTitle: verifiedTitle
            });
        }
    }

    return {
        restoredCount: restoredUsers.length,
        cleanedCount,
        restoredUsers
    };
}

/**
 * Scans the database for jobs where applicationUrl or description was incorrectly set
 * to a mismatched third-party URL (e.g. Ashby GPTZero) when the job company is NOT GPTZero,
 * and resets those fields so the job can be accurately scraped, viewed, and applied to.
 */
export async function cleanMismatchedJobs(): Promise<{
    cleanedJobCount: number;
    cleanedJobs: Array<{ id: string; title: string; company: string; previousUrl: string | null }>;
}> {
    const corruptedJobs = await prisma.job.findMany({
        where: {
            OR: [
                { applicationUrl: { contains: 'GPTZero' } },
                { applicationUrl: { contains: 'gptzero' } },
                { applicationUrl: { contains: '65467d13-846b-4bf1-b125-caae861f2f00' } }
            ]
        },
        select: {
            id: true,
            title: true,
            company: true,
            url: true,
            applicationUrl: true,
            description: true,
        }
    });

    const cleanedJobs: Array<{ id: string; title: string; company: string; previousUrl: string | null }> = [];

    for (const job of corruptedJobs) {
        // Only clean if the company is NOT genuinely GPTZero
        if (!job.company.toLowerCase().includes('gptzero')) {
            const previousUrl = job.applicationUrl;
            
            // Clean description if it was contaminated with GPTZero's description
            let newDesc = job.description;
            if (newDesc && (newDesc.toLowerCase().includes('gptzero') || newDesc.includes('65467d13-846b-4bf1-b125-caae861f2f00'))) {
                // Strip the corrupted GPTZero trailing text or reset to original stub if available
                newDesc = newDesc.replace(/\n*Apply at: https:\/\/jobs\.ashbyhq\.com\/GPTZero[^\n]*/gi, '').trim();
            }

            await prisma.job.update({
                where: { id: job.id },
                data: {
                    applicationUrl: null,
                    description: newDesc || job.description
                }
            });

            // Also clean any ApplicationAsset records for this job that were tailored against GPTZero instead of the real company
            await prisma.applicationAsset.deleteMany({
                where: {
                    jobId: job.id,
                    OR: [
                        { tailoredResumeMarkdown: { contains: 'GPTZero' } },
                        { coverLetterMarkdown: { contains: 'GPTZero' } },
                        { networkingMessage: { contains: 'GPTZero' } }
                    ]
                }
            });

            cleanedJobs.push({
                id: job.id,
                title: job.title,
                company: job.company,
                previousUrl
            });
        }
    }

    return {
        cleanedJobCount: cleanedJobs.length,
        cleanedJobs
    };
}


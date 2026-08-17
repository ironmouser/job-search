import { prisma } from './prisma';

/**
 * Clean up an extracted title string (strip trailing markdown, periods, delimiters).
 */
function cleanExtractedTitle(raw: string): string | null {
    if (!raw) return null;
    let title = raw
        .replace(/[*_#`]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

    // Strip trailing punctuation or sentences
    title = title.split(/[.,;\n]/)[0].trim();

    // Strip company suffixes like " at Acme Corp" or " | Location"
    if (title.includes(' | ')) {
        title = title.split(' | ')[0].trim();
    }
    if (title.toLowerCase().includes(' at ')) {
        title = title.split(/\s+at\s+/i)[0].trim();
    }

    // Discard if too long or obviously not a job title (e.g. paragraph or email)
    if (!title || title.length < 2 || title.length > 80 || title.includes('@') || title.includes('http')) {
        return null;
    }

    return title;
}

/**
 * Extracts a target job title from a user's stored profile rubric or resume text.
 */
export function extractJobTitleFromProfileOrResume(profile?: string | null, resumeMarkdown?: string | null): string | null {
    // 1. Try Profile rubric patterns
    if (profile && typeof profile === 'string' && profile.trim()) {
        const p = profile.trim();

        const goalMatch = p.match(/Seeking high-growth(?: tech)? opportunities as an?\s+([^.\n#]+)/i);
        if (goalMatch) {
            const cleaned = cleanExtractedTitle(goalMatch[1]);
            if (cleaned) return cleaned;
        }

        const targetRoleMatch = p.match(/(?:Target Role|Target Job Title|Target Job|Target Position|Target):\s*([^\n#]+)/i);
        if (targetRoleMatch) {
            const cleaned = cleanExtractedTitle(targetRoleMatch[1]);
            if (cleaned) return cleaned;
        }

        const seekingMatch = p.match(/Seeking\s+(?:opportunities|roles?|positions?|employment)\s+as\s+an?\s+([^.\n#]+)/i);
        if (seekingMatch) {
            const cleaned = cleanExtractedTitle(seekingMatch[1]);
            if (cleaned) return cleaned;
        }

        const seekingDirect = p.match(/Seeking\s+an?\s+([^.\n#]+?)\s+(?:role|position|opportunity)/i);
        if (seekingDirect) {
            const cleaned = cleanExtractedTitle(seekingDirect[1]);
            if (cleaned) return cleaned;
        }

        const asMatch = p.match(/as an?\s+([^,.\n#]+?)(?:,|\.|\s+with|\s+looking)/i);
        if (asMatch) {
            const cleaned = cleanExtractedTitle(asMatch[1]);
            if (cleaned) return cleaned;
        }
    }

    // 2. Try Resume Markdown patterns
    if (resumeMarkdown && typeof resumeMarkdown === 'string' && resumeMarkdown.trim()) {
        const lines = resumeMarkdown.trim().split('\n').map(l => l.trim()).filter(Boolean);

        // Check the line right under # Name header
        for (let i = 0; i < Math.min(lines.length, 6); i++) {
            const line = lines[i];
            if (line.startsWith('# ') && i + 1 < lines.length) {
                const nextLine = lines[i + 1].replace(/[*_#]/g, '').trim();
                // If next line is not email/phone/link, it is likely the candidate title/headline
                if (nextLine && !nextLine.includes('@') && !nextLine.includes('http') && !/\d{3}[-.]?\d{3}/.test(nextLine)) {
                    const cleaned = cleanExtractedTitle(nextLine);
                    if (cleaned) return cleaned;
                }
            }
        }

        // Check for Experience section title headings: e.g. "### Senior Software Engineer"
        const expHeadingMatch = resumeMarkdown.match(/###\s+([^\n–—|]+)(?:\s*–|\s*—|\s*\||\s+at\s+)/i);
        if (expHeadingMatch) {
            const cleaned = cleanExtractedTitle(expHeadingMatch[1]);
            if (cleaned) return cleaned;
        }

        const boldRoleMatch = resumeMarkdown.match(/\*\*([A-Z][A-Za-z\s/]+(?:Engineer|Developer|Manager|Director|Lead|Designer|Analyst|Consultant|Specialist|Associate|Executive|Architect|Administrator|Coordinator|Officer|Scientist|Representative))\*\*/);
        if (boldRoleMatch) {
            const cleaned = cleanExtractedTitle(boldRoleMatch[1]);
            if (cleaned) return cleaned;
        }
    }

    return null;
}

/**
 * Batch scans and restores job titles for all users whose searchKeyword is empty/null.
 * Also handles users missing UserPreferences records or using fallback feedback/job data.
 */
export async function restoreMissingJobTitles(): Promise<{
    restoredCount: number;
    restoredUsers: Array<{ userId: string; email: string | null; restoredTitle: string }>;
}> {
    // 1. Find all users in the system
    const allUsers = await prisma.user.findMany({
        select: {
            id: true,
            email: true,
            userPreferences: true,
            appFeedbacks: {
                take: 1,
                orderBy: { createdAt: 'desc' },
                select: { jobTitle: true }
            },
            userJobs: {
                take: 3,
                orderBy: { createdAt: 'desc' },
                select: {
                    job: { select: { title: true } }
                }
            }
        }
    });

    const restoredUsers: Array<{ userId: string; email: string | null; restoredTitle: string }> = [];

    for (const u of allUsers) {
        const currentKeyword = u.userPreferences?.searchKeyword?.trim();
        if (currentKeyword) {
            // User already has a valid job title
            continue;
        }

        // Try extracting from profile or resume
        let extractedTitle = extractJobTitleFromProfileOrResume(
            u.userPreferences?.profile,
            u.userPreferences?.resumeMarkdown
        );

        // Fallback 1: App Feedback jobTitle
        if (!extractedTitle && u.appFeedbacks?.length > 0 && u.appFeedbacks[0].jobTitle?.trim()) {
            const cleaned = cleanExtractedTitle(u.appFeedbacks[0].jobTitle);
            if (cleaned && cleaned !== 'Job Seeker') extractedTitle = cleaned;
        }

        // Fallback 2: Saved / discovered job titles
        if (!extractedTitle && u.userJobs?.length > 0) {
            for (const uj of u.userJobs) {
                if (uj.job?.title) {
                    const cleaned = cleanExtractedTitle(uj.job.title);
                    if (cleaned) {
                        extractedTitle = cleaned;
                        break;
                    }
                }
            }
        }

        // Fallback 3: Use jobLevel or default role if they went through onboarding
        if (!extractedTitle && u.userPreferences?.jobLevel && u.userPreferences.jobLevel !== 'Mid-level') {
            extractedTitle = u.userPreferences.jobLevel;
        }

        if (extractedTitle) {
            if (u.userPreferences) {
                await prisma.userPreferences.update({
                    where: { id: u.userPreferences.id },
                    data: { searchKeyword: extractedTitle }
                });
            } else {
                await prisma.userPreferences.create({
                    data: {
                        userId: u.id,
                        searchKeyword: extractedTitle,
                        jobLevel: 'Mid-level',
                        theme: 'light',
                    }
                });
            }

            restoredUsers.push({
                userId: u.id,
                email: u.email || null,
                restoredTitle: extractedTitle
            });
        }
    }

    return {
        restoredCount: restoredUsers.length,
        restoredUsers
    };
}

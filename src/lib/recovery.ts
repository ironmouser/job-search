import { prisma } from './prisma';

/**
 * Extracts a target job title from a user's stored profile rubric or resume.
 */
export function extractJobTitleFromProfileOrResume(profile?: string | null, resumeMarkdown?: string | null): string | null {
    if (profile && typeof profile === 'string') {
        const goalMatch = profile.match(/Seeking high-growth(?: tech)? opportunities as an?\s+([^.\n#]+)/i);
        if (goalMatch && goalMatch[1].trim()) {
            return goalMatch[1].trim();
        }
        const targetRoleMatch = profile.match(/Target Role:\s*([^\n#]+)/i);
        if (targetRoleMatch && targetRoleMatch[1].trim()) {
            return targetRoleMatch[1].trim();
        }
        const seekingMatch = profile.match(/Seeking\s+(?:opportunities\s+as\s+an?\s+|roles\s+as\s+an?\s+)([^.\n#]+)/i);
        if (seekingMatch && seekingMatch[1].trim()) {
            return seekingMatch[1].trim();
        }
    }
    return null;
}

/**
 * Batch scans and restores job titles for all users whose searchKeyword is empty/null.
 */
export async function restoreMissingJobTitles(): Promise<{ restoredCount: number; restoredUsers: Array<{ userId: string; email: string | null; restoredTitle: string }> }> {
    const affectedPrefs = await prisma.userPreferences.findMany({
        where: {
            OR: [
                { searchKeyword: null },
                { searchKeyword: '' }
            ]
        },
        include: {
            user: { select: { id: true, email: true } }
        }
    });

    const restoredUsers: Array<{ userId: string; email: string | null; restoredTitle: string }> = [];

    for (const pref of affectedPrefs) {
        const title = extractJobTitleFromProfileOrResume(pref.profile, pref.resumeMarkdown);
        if (title) {
            await prisma.userPreferences.update({
                where: { id: pref.id },
                data: { searchKeyword: title }
            });
            restoredUsers.push({
                userId: pref.userId,
                email: pref.user?.email || null,
                restoredTitle: title
            });
        }
    }

    return {
        restoredCount: restoredUsers.length,
        restoredUsers
    };
}

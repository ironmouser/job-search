import { prisma } from './prisma';
import { UserPreferences } from '@prisma/client';

let columnsChecked = false;

export async function ensureKeywordColumnsExist() {
    if (columnsChecked) return;
    try {
        await prisma.$executeRawUnsafe(`
            ALTER TABLE "user_preferences" ADD COLUMN IF NOT EXISTS "include_keywords" TEXT;
            ALTER TABLE "user_preferences" ADD COLUMN IF NOT EXISTS "exclude_keywords" TEXT;
        `);
        columnsChecked = true;
    } catch (e) {
        console.warn('Auto-schema update warning:', e);
    }
}

export async function getUserSettings(userId: string): Promise<Partial<UserPreferences>> {
    try {
        await ensureKeywordColumnsExist();
        const prefs = await prisma.userPreferences.findUnique({
            where: { userId }
        });
        if (!prefs) return {};
        return prefs;
    } catch (e) {
        console.error('Error fetching user settings:', e);
        return {};
    }
}


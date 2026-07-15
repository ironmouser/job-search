import { prisma } from './prisma';
import { UserPreferences } from '@prisma/client';

export async function getUserSettings(userId: string): Promise<Partial<UserPreferences>> {
    try {
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

import { prisma } from '@/lib/prisma';
import { getEffectiveTier } from '@/lib/tier';
import { DEFAULT_FREE_SOURCES, DEFAULT_PRO_SOURCES, FREE_ALLOWED_SOURCES } from '@/lib/settings';
import { healLocation } from '@/lib/locationNormalizer';

export interface UserSearchCriteria {
  userId: string;
  email: string;
  name?: string | null;
  searchKeyword: string;
  jobLevel: string;
  searchLocation: string;
  normalizedLocation: string;
  remoteOnly: boolean;
  noInternational: boolean;
  includeKeywords: string[];
  excludeKeywords: string[];
  sources: Record<string, boolean>;
  customCareerPages: string[];
  isPro: boolean;
}

export function parseKeywordsList(raw?: string | null): string[] {
  if (!raw || typeof raw !== 'string') return [];
  return raw
    .split(/[,;\n]+/)
    .map(k => k.trim().toLowerCase())
    .filter(k => k.length > 0);
}

/**
 * Loads all users who have opted into Job Match emails and have a valid searchKeyword and email.
 */
export async function getOptedInUsersCriteria(): Promise<UserSearchCriteria[]> {
  const usersWithPrefs = await prisma.user.findMany({
    where: {
      isDisabled: false,
      email: { not: null },
      userPreferences: {
        jobMatchEmailsEnabled: true,
        searchKeyword: { not: null },
      },
    },
    select: {
      id: true,
      email: true,
      name: true,
      planTier: true,
      trialEndsAt: true,
      subscriptionType: true,
      orgAccessExpiresAt: true,
      userPreferences: true,
    },
  });

  const criteriaList: UserSearchCriteria[] = [];

  for (const u of usersWithPrefs) {
    if (!u.email || !u.userPreferences) continue;
    const pref = u.userPreferences;
    const keyword = (pref.searchKeyword || '').trim();
    if (!keyword) continue;

    const isPro = getEffectiveTier(u as any) === 'PRO';
    const rawLoc = (pref.searchLocation || 'Remote').trim();
    const healedLoc = healLocation(rawLoc) || rawLoc;

    const sources = pref.sources && typeof pref.sources === 'object'
      ? { ...(pref.sources as Record<string, boolean>) }
      : (isPro ? { ...DEFAULT_PRO_SOURCES } : { ...DEFAULT_FREE_SOURCES });

    if (!isPro) {
      const freeAllowed = new Set(FREE_ALLOWED_SOURCES);
      for (const k of Object.keys(sources)) {
        if (!freeAllowed.has(k)) {
          sources[k] = false;
        }
      }
    } else {
      for (const [k, v] of Object.entries(DEFAULT_PRO_SOURCES)) {
        if (sources[k] === undefined) {
          sources[k] = v;
        }
      }
    }

    criteriaList.push({
      userId: u.id,
      email: u.email,
      name: u.name,
      searchKeyword: keyword,
      jobLevel: pref.jobLevel || 'Mid-level',
      searchLocation: rawLoc,
      normalizedLocation: healedLoc.toLowerCase(),
      remoteOnly: Boolean(pref.remoteOnly),
      noInternational: Boolean(pref.noInternational),
      includeKeywords: parseKeywordsList(pref.includeKeywords),
      excludeKeywords: parseKeywordsList(pref.excludeKeywords),
      sources,
      customCareerPages: isPro ? (pref.customCareerPages || []) : [],
      isPro,
    });
  }

  return criteriaList;
}
